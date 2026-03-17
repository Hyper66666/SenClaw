import { createChildLogger, createLogger } from "@senclaw/logging";
import type {
  Agent,
  CreateAgent,
  IAgentRepository,
  IMessageRepository,
  IRunRepository,
  Message,
  Run,
} from "@senclaw/protocol";
import type { ToolRegistry } from "@senclaw/tool-runner-host";
import { type ExecutionOptions, executeRun } from "./execution-loop.js";
import {
  InMemoryAgentRepository,
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

export class AgentService {
  private agentRepo: IAgentRepository;
  private runRepo: IRunRepository;
  private messageRepo: IMessageRepository;
  private toolRegistry: ToolRegistry;
  private options: ExecutionOptions;

  constructor(
    toolRegistry: ToolRegistry,
    options: ExecutionOptions,
    agentRepo?: IAgentRepository,
    runRepo?: IRunRepository,
    messageRepo?: IMessageRepository,
  ) {
    this.toolRegistry = toolRegistry;
    this.options = options;
    this.agentRepo = agentRepo ?? new InMemoryAgentRepository();
    this.runRepo = runRepo ?? new InMemoryRunRepository();
    this.messageRepo = messageRepo ?? new InMemoryMessageRepository();
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

  async getRun(id: string): Promise<Run | undefined> {
    return this.runRepo.get(id);
  }

  async listRuns(): Promise<Run[]> {
    return this.runRepo.list();
  }

  async getRunMessages(runId: string): Promise<Message[]> {
    return this.messageRepo.listByRunId(runId);
  }
}
