import type { Agent, CreateAgent } from "./agent.js";
import type {
  AgentRunLink,
  AgentTask,
  AgentTaskPendingMessage,
  AgentTranscriptEntry,
  CreateAgentTask,
  CreateAgentTaskPendingMessage,
} from "./agent-task.js";
import type { ApiKeyListFilters, ApiKeyRecord } from "./api-key.js";
import type { AuditLog, AuditLogListOptions } from "./audit-log.js";
import type { Message } from "./message.js";
import type { Run, RunStatus } from "./run.js";

export interface IAgentRepository {
  create(data: CreateAgent): Promise<Agent>;
  get(id: string): Promise<Agent | undefined>;
  list(): Promise<Agent[]>;
  delete(id: string): Promise<boolean>;
}

export interface IAgentTaskRepository {
  create(data: CreateAgentTask): Promise<AgentTask>;
  get(id: string): Promise<AgentTask | undefined>;
  list(): Promise<AgentTask[]>;
  updateStatus(
    id: string,
    status: AgentTask["status"],
    error?: string,
  ): Promise<AgentTask | undefined>;
  setActiveRun(
    id: string,
    activeRunId?: string,
  ): Promise<AgentTask | undefined>;
}

export interface IRunRepository {
  create(agentId: string, input: string, link?: AgentRunLink): Promise<Run>;
  get(id: string): Promise<Run | undefined>;
  list(): Promise<Run[]>;
  updateStatus(
    id: string,
    status: RunStatus,
    error?: string,
  ): Promise<Run | undefined>;
}

export interface IMessageRepository {
  append(runId: string, message: Message): Promise<void>;
  listByRunId(runId: string): Promise<Message[]>;
}

export interface IAgentTaskMessageRepository {
  append(
    taskId: string,
    message: Message,
    sourceRunId?: string,
  ): Promise<AgentTranscriptEntry>;
  listByTaskId(taskId: string): Promise<AgentTranscriptEntry[]>;
}

export interface IAgentTaskPendingMessageRepository {
  enqueue(
    data: CreateAgentTaskPendingMessage,
  ): Promise<AgentTaskPendingMessage>;
  listPendingByTaskId(taskId: string): Promise<AgentTaskPendingMessage[]>;
  markDelivered(id: string): Promise<AgentTaskPendingMessage | undefined>;
}

export interface IApiKeyRepository {
  create(data: ApiKeyRecord): Promise<ApiKeyRecord>;
  get(id: string): Promise<ApiKeyRecord | undefined>;
  list(filters?: ApiKeyListFilters): Promise<ApiKeyRecord[]>;
  findByLookupHash(lookupHash: string): Promise<ApiKeyRecord | undefined>;
  updateLastUsed(id: string): Promise<void>;
  revoke(
    id: string,
    revokedBy: string,
    revokedReason: string,
  ): Promise<ApiKeyRecord | undefined>;
  count(): Promise<number>;
}

export interface IAuditLogRepository {
  create(data: AuditLog): Promise<AuditLog>;
  listByKeyId(
    keyId: string,
    options?: AuditLogListOptions,
  ): Promise<AuditLog[]>;
  countByKeyId(keyId: string): Promise<number>;
  deleteOlderThan(timestamp: string): Promise<number>;
}
