import { randomUUID } from "node:crypto";
import type {
  Agent,
  CreateAgent,
  IAgentRepository,
  IMessageRepository,
  IRunRepository,
  Message,
  Run,
  RunStatus,
} from "@senclaw/protocol";

export class InMemoryAgentRepository implements IAgentRepository {
  private agents = new Map<string, Agent>();

  async create(data: CreateAgent): Promise<Agent> {
    const agent: Agent = { id: randomUUID(), ...data };
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

export class InMemoryRunRepository implements IRunRepository {
  private runs = new Map<string, Run>();

  async create(agentId: string, input: string): Promise<Run> {
    const now = new Date().toISOString();
    const run: Run = {
      id: randomUUID(),
      agentId,
      input,
      status: "pending",
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
