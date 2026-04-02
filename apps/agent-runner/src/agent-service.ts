import { createChildLogger, createLogger } from "@senclaw/logging";
import type {
  Agent,
  AgentTask,
  AgentTaskPendingMessage,
  CreateAgent,
  IAgentRepository,
  IAgentTaskMessageRepository,
  IAgentTaskPendingMessageRepository,
  IAgentTaskRepository,
  IMessageRepository,
  IRunRepository,
  Message,
  Run,
} from "@senclaw/protocol";
import type { ToolRegistry } from "@senclaw/tool-runner-host";
import {
  type ExecutionOptions,
  executeRun,
  executeRunRequest,
} from "./execution-loop.js";
import {
  InMemoryAgentRepository,
  InMemoryAgentTaskMessageRepository,
  InMemoryAgentTaskPendingMessageRepository,
  InMemoryAgentTaskRepository,
  InMemoryMessageRepository,
  InMemoryRunRepository,
} from "./repositories.js";
import { markRunFailed } from "./run-failure.js";

const logger = createLogger(
  "agent-runner",
  (process.env.SENCLAW_LOG_LEVEL as
    | "trace"
    | "debug"
    | "info"
    | "warn"
    | "error"
    | "fatal"
    | undefined) ?? "info",
);

interface CreateBackgroundTaskOptions {
  background?: boolean;
  parentRunId?: string;
  parentTaskId?: string;
  metadata?: Record<string, unknown>;
}

class MirroringMessageRepository implements IMessageRepository {
  constructor(
    private readonly taskId: string,
    private readonly runMessages: IMessageRepository,
    private readonly taskMessages: IAgentTaskMessageRepository,
  ) {}

  async append(runId: string, message: Message): Promise<void> {
    await this.runMessages.append(runId, message);
    await this.taskMessages.append(this.taskId, message, runId);
  }

  async listByRunId(runId: string): Promise<Message[]> {
    return this.runMessages.listByRunId(runId);
  }
}

export class AgentService {
  private agentRepo: IAgentRepository;
  private agentTaskRepo: IAgentTaskRepository;
  private agentTaskMessageRepo: IAgentTaskMessageRepository;
  private agentTaskPendingMessageRepo: IAgentTaskPendingMessageRepository;
  private runRepo: IRunRepository;
  private messageRepo: IMessageRepository;
  private toolRegistry: ToolRegistry;
  private options: ExecutionOptions;
  private activeTaskLaunches = new Set<string>();

  constructor(
    toolRegistry: ToolRegistry,
    options: ExecutionOptions,
    agentRepo?: IAgentRepository,
    runRepo?: IRunRepository,
    messageRepo?: IMessageRepository,
    agentTaskRepo?: IAgentTaskRepository,
    agentTaskMessageRepo?: IAgentTaskMessageRepository,
    agentTaskPendingMessageRepo?: IAgentTaskPendingMessageRepository,
  ) {
    this.toolRegistry = toolRegistry;
    this.options = options;
    this.agentRepo = agentRepo ?? new InMemoryAgentRepository();
    this.runRepo = runRepo ?? new InMemoryRunRepository();
    this.messageRepo = messageRepo ?? new InMemoryMessageRepository();
    this.agentTaskRepo = agentTaskRepo ?? new InMemoryAgentTaskRepository();
    this.agentTaskMessageRepo =
      agentTaskMessageRepo ??
      new InMemoryAgentTaskMessageRepository(
        this.agentTaskRepo as InMemoryAgentTaskRepository,
      );
    this.agentTaskPendingMessageRepo =
      agentTaskPendingMessageRepo ??
      new InMemoryAgentTaskPendingMessageRepository();
  }

  async createAgent(data: CreateAgent): Promise<Agent> {
    return this.agentRepo.create(data);
  }

  async getAgent(id: string): Promise<Agent | undefined> {
    return this.agentRepo.get(id);
  }

  async listAgents(): Promise<Agent[]> {
    return this.agentRepo.list();
  }

  async deleteAgent(id: string): Promise<boolean> {
    return this.agentRepo.delete(id);
  }

  async submitTask(agentId: string, input: string): Promise<Run> {
    const agent = await this.agentRepo.get(agentId);
    if (!agent) {
      throw new Error(`Agent "${agentId}" not found`);
    }

    const run = await this.runRepo.create(agentId, input);
    const runLogger = createChildLogger(logger, {
      agentId: agent.id,
      runId: run.id,
    });

    void executeRun(
      run.id,
      agent,
      input,
      this.toolRegistry,
      this.runRepo,
      this.messageRepo,
      this.options,
    ).catch(async (error) => {
      runLogger.error(
        { error },
        "Agent execution failed after task submission",
      );
      await markRunFailed(run.id, error, this.runRepo, runLogger);
    });

    return run;
  }

  async createBackgroundTask(
    agentId: string,
    input: string,
    options: CreateBackgroundTaskOptions = {},
  ): Promise<AgentTask> {
    const agent = await this.agentRepo.get(agentId);
    if (!agent) {
      throw new Error(`Agent "${agentId}" not found`);
    }

    if (!agent.background) {
      throw new Error(`Agent "${agentId}" does not allow background execution`);
    }

    const task = await this.agentTaskRepo.create({
      selectedAgentId: agentId,
      initialInput: input,
      background: options.background ?? true,
      parentRunId: options.parentRunId,
      parentTaskId: options.parentTaskId,
      metadata: options.metadata ?? {},
    });

    await this.startAgentTaskExecution(task, agent, input, []);
    return (await this.agentTaskRepo.get(task.id)) ?? task;
  }

  async getAgentTask(id: string): Promise<AgentTask | undefined> {
    return this.agentTaskRepo.get(id);
  }

  async listAgentTasks(): Promise<AgentTask[]> {
    return this.agentTaskRepo.list();
  }

  async getAgentTaskMessages(taskId: string): Promise<Message[]> {
    const transcript = await this.agentTaskMessageRepo.listByTaskId(taskId);
    return transcript.map((entry) => entry.message);
  }

  async getPendingAgentTaskMessages(
    taskId: string,
  ): Promise<AgentTaskPendingMessage[]> {
    return this.agentTaskPendingMessageRepo.listPendingByTaskId(taskId);
  }

  async sendMessageToAgentTask(
    taskId: string,
    content: string,
    role: AgentTaskPendingMessage["role"] = "user",
  ): Promise<AgentTaskPendingMessage> {
    const task = await this.agentTaskRepo.get(taskId);
    if (!task) {
      throw new Error(`Agent task "${taskId}" not found`);
    }

    const pending = await this.agentTaskPendingMessageRepo.enqueue({
      taskId,
      role,
      content,
    });

    if (task.status !== "running" || !task.activeRunId) {
      void this.resumeAgentTask(taskId).catch((error) => {
        createChildLogger(logger, { taskId }).error(
          { error },
          "Failed to resume background agent after follow-up message",
        );
      });
    }

    return pending;
  }

  async resumeAgentTask(taskId: string): Promise<AgentTask> {
    const task = await this.agentTaskRepo.get(taskId);
    if (!task) {
      throw new Error(`Agent task "${taskId}" not found`);
    }

    if (task.status === "running" && task.activeRunId) {
      return task;
    }

    const agent = await this.agentRepo.get(task.selectedAgentId);
    if (!agent) {
      throw new Error(`Agent "${task.selectedAgentId}" not found`);
    }

    const transcript = await this.agentTaskMessageRepo.listByTaskId(task.id);
    const pending = await this.agentTaskPendingMessageRepo.listPendingByTaskId(
      task.id,
    );

    const input =
      pending.length > 0
        ? pending.map((message) => message.content).join("\n\n")
        : "Continue from the current state and report progress.";

    const startedTask = await this.startAgentTaskExecution(
      task,
      agent,
      input,
      transcript.map((entry) => entry.message),
    );

    for (const message of pending) {
      await this.agentTaskPendingMessageRepo.markDelivered(message.id);
    }

    return startedTask;
  }

  async getRun(id: string): Promise<Run | undefined> {
    return this.runRepo.get(id);
  }

  async listRuns(): Promise<Run[]> {
    return this.runRepo.list();
  }

  async getRunMessages(runId: string): Promise<Message[]> {
    return this.messageRepo.listByRunId(runId);
  }

  private async startAgentTaskExecution(
    task: AgentTask,
    agent: Agent,
    userInput: string,
    historyMessages: Message[],
  ): Promise<AgentTask> {
    if (this.activeTaskLaunches.has(task.id)) {
      return (await this.agentTaskRepo.get(task.id)) ?? task;
    }

    this.activeTaskLaunches.add(task.id);
    try {
      const run = await this.runRepo.create(agent.id, userInput, {
        parentRunId: task.parentRunId,
        agentTaskId: task.id,
      });

      await this.agentTaskRepo.setActiveRun(task.id, run.id);
      const runningTask =
        (await this.agentTaskRepo.updateStatus(task.id, "running")) ?? task;
      const taskLogger = createChildLogger(logger, {
        taskId: task.id,
        agentId: agent.id,
        runId: run.id,
      });
      const mirroredMessages = new MirroringMessageRepository(
        task.id,
        this.messageRepo,
        this.agentTaskMessageRepo,
      );

      void (async () => {
        try {
          await executeRunRequest({
            runId: run.id,
            agent,
            userInput,
            toolRegistry: this.toolRegistry,
            runRepo: this.runRepo,
            messageRepo: mirroredMessages,
            options: this.options,
            link: {
              parentRunId: task.parentRunId,
              agentTaskId: task.id,
            },
            historyMessages,
          });
        } catch (error) {
          taskLogger.error({ error }, "Background agent execution failed");
        } finally {
          this.activeTaskLaunches.delete(task.id);
          const storedRun = await this.runRepo.get(run.id);
          await this.agentTaskRepo.setActiveRun(task.id, undefined);
          await this.agentTaskRepo.updateStatus(
            task.id,
            storedRun?.status === "failed" ? "failed" : "completed",
            storedRun?.error,
          );

          const pending =
            await this.agentTaskPendingMessageRepo.listPendingByTaskId(task.id);
          if (pending.length > 0) {
            void this.resumeAgentTask(task.id).catch((error) => {
              taskLogger.error(
                { error },
                "Failed to auto-resume background agent with pending follow-up messages",
              );
            });
          }
        }
      })();

      return runningTask;
    } catch (error) {
      this.activeTaskLaunches.delete(task.id);
      await this.agentTaskRepo.updateStatus(
        task.id,
        "failed",
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  }
}
