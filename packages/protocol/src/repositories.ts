import type { Agent, CreateAgent } from "./agent.js";
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

export interface IRunRepository {
  create(agentId: string, input: string): Promise<Run>;
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
