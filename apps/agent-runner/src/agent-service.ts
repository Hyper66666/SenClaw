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

    void executeRun(
      run.id,
      agent,
      input,
      this.toolRegistry,
      this.runRepo,
      this.messageRepo,
      this.options,
    ).catch(async (error) => {
      const errMsg = error instanceof Error ? error.message : String(error);
      await this.runRepo.updateStatus(run.id, "failed", errMsg);
    });

    return run;
  }

  async getRun(id: string): Promise<Run | undefined> {
    return this.runRepo.get(id);
  }

  async getRunMessages(runId: string): Promise<Message[]> {
    return this.messageRepo.listByRunId(runId);
  }
}
