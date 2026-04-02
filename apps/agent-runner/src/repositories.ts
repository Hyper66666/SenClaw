import { randomUUID } from "node:crypto";
import type {
  Agent,
  AgentRunLink,
  AgentTask,
  AgentTaskPendingMessage,
  AgentTranscriptEntry,
  CreateAgent,
  CreateAgentTask,
  CreateAgentTaskPendingMessage,
  IAgentRepository,
  IAgentTaskMessageRepository,
  IAgentTaskPendingMessageRepository,
  IAgentTaskRepository,
  IMessageRepository,
  IRunRepository,
  Message,
  Run,
  RunStatus,
} from "@senclaw/protocol";

export class InMemoryAgentRepository implements IAgentRepository {
  private agents = new Map<string, Agent>();

  async create(data: CreateAgent): Promise<Agent> {
    const agent: Agent = {
      id: randomUUID(),
      name: data.name,
      systemPrompt: data.systemPrompt,
      provider: data.provider,
      tools: data.tools ?? [],
      effort: data.effort ?? "medium",
      isolation: data.isolation ?? "shared",
      permissionMode: data.permissionMode ?? "default",
      mode: data.mode ?? "standard",
      maxTurns: data.maxTurns,
      background: data.background ?? false,
    };
    this.agents.set(agent.id, agent);
    return agent;
  }

  async get(id: string): Promise<Agent | undefined> {
    return this.agents.get(id);
  }

  async list(): Promise<Agent[]> {
    return Array.from(this.agents.values());
  }

  async delete(id: string): Promise<boolean> {
    return this.agents.delete(id);
  }
}

export class InMemoryAgentTaskRepository implements IAgentTaskRepository {
  private tasks = new Map<string, AgentTask>();

  async create(data: CreateAgentTask): Promise<AgentTask> {
    const now = new Date().toISOString();
    const id = randomUUID();
    const task: AgentTask = {
      id,
      selectedAgentId: data.selectedAgentId,
      status: "pending",
      initialInput: data.initialInput,
      background: data.background ?? true,
      parentRunId: data.parentRunId,
      parentTaskId: data.parentTaskId,
      activeRunId: undefined,
      transcript: {
        taskId: id,
        lastMessageSeq: 0,
      },
      metadata: data.metadata ?? {},
      createdAt: now,
      updatedAt: now,
    };
    this.tasks.set(id, task);
    return task;
  }

  async get(id: string): Promise<AgentTask | undefined> {
    return this.tasks.get(id);
  }

  async list(): Promise<AgentTask[]> {
    return Array.from(this.tasks.values());
  }

  async updateStatus(
    id: string,
    status: AgentTask["status"],
    error?: string,
  ): Promise<AgentTask | undefined> {
    const task = this.tasks.get(id);
    if (!task) return undefined;
    const updated: AgentTask = {
      ...task,
      status,
      updatedAt: new Date().toISOString(),
      error: error ?? task.error,
    };
    this.tasks.set(id, updated);
    return updated;
  }

  async setActiveRun(
    id: string,
    activeRunId?: string,
  ): Promise<AgentTask | undefined> {
    const task = this.tasks.get(id);
    if (!task) return undefined;
    const updated: AgentTask = {
      ...task,
      activeRunId,
      updatedAt: new Date().toISOString(),
    };
    this.tasks.set(id, updated);
    return updated;
  }

  updateTranscriptCursor(id: string, seq: number): void {
    const task = this.tasks.get(id);
    if (!task) return;
    this.tasks.set(id, {
      ...task,
      transcript: {
        taskId: task.id,
        lastMessageSeq: seq,
      },
      updatedAt: new Date().toISOString(),
    });
  }
}

export class InMemoryRunRepository implements IRunRepository {
  private runs = new Map<string, Run>();

  async create(
    agentId: string,
    input: string,
    link?: AgentRunLink,
  ): Promise<Run> {
    const now = new Date().toISOString();
    const run: Run = {
      id: randomUUID(),
      agentId,
      input,
      status: "pending",
      parentRunId: link?.parentRunId,
      agentTaskId: link?.agentTaskId,
      createdAt: now,
      updatedAt: now,
    };
    this.runs.set(run.id, run);
    return run;
  }

  async get(id: string): Promise<Run | undefined> {
    return this.runs.get(id);
  }

  async updateStatus(
    id: string,
    status: RunStatus,
    error?: string,
  ): Promise<Run | undefined> {
    const run = this.runs.get(id);
    if (!run) return undefined;
    const updated: Run = {
      ...run,
      status,
      updatedAt: new Date().toISOString(),
      error: error ?? run.error,
    };
    this.runs.set(id, updated);
    return updated;
  }

  async list(): Promise<Run[]> {
    return Array.from(this.runs.values());
  }
}

export class InMemoryMessageRepository implements IMessageRepository {
  private messages = new Map<string, Message[]>();

  async append(runId: string, message: Message): Promise<void> {
    const existing = this.messages.get(runId) ?? [];
    existing.push(message);
    this.messages.set(runId, existing);
  }

  async listByRunId(runId: string): Promise<Message[]> {
    return this.messages.get(runId) ?? [];
  }
}

export class InMemoryAgentTaskMessageRepository
  implements IAgentTaskMessageRepository
{
  private messages = new Map<string, AgentTranscriptEntry[]>();

  constructor(private readonly tasks: InMemoryAgentTaskRepository) {}

  async append(
    taskId: string,
    message: Message,
    sourceRunId?: string,
  ): Promise<AgentTranscriptEntry> {
    const existing = this.messages.get(taskId) ?? [];
    const entry: AgentTranscriptEntry = {
      seq: existing.length + 1,
      taskId,
      sourceRunId,
      message,
      insertedAt: new Date().toISOString(),
    };
    existing.push(entry);
    this.messages.set(taskId, existing);
    this.tasks.updateTranscriptCursor(taskId, entry.seq);
    return entry;
  }

  async listByTaskId(taskId: string): Promise<AgentTranscriptEntry[]> {
    return this.messages.get(taskId) ?? [];
  }
}

export class InMemoryAgentTaskPendingMessageRepository
  implements IAgentTaskPendingMessageRepository
{
  private messages = new Map<string, AgentTaskPendingMessage>();

  async enqueue(
    data: CreateAgentTaskPendingMessage,
  ): Promise<AgentTaskPendingMessage> {
    const message: AgentTaskPendingMessage = {
      id: randomUUID(),
      taskId: data.taskId,
      role: data.role,
      content: data.content,
      createdAt: new Date().toISOString(),
    };
    this.messages.set(message.id, message);
    return message;
  }

  async listPendingByTaskId(
    taskId: string,
  ): Promise<AgentTaskPendingMessage[]> {
    return Array.from(this.messages.values()).filter(
      (message) => message.taskId === taskId && !message.deliveredAt,
    );
  }

  async markDelivered(
    id: string,
  ): Promise<AgentTaskPendingMessage | undefined> {
    const message = this.messages.get(id);
    if (!message) {
      return undefined;
    }
    const updated: AgentTaskPendingMessage = {
      ...message,
      deliveredAt: new Date().toISOString(),
    };
    this.messages.set(id, updated);
    return updated;
  }
}
