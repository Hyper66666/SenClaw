import { SqliteAgentRepository } from "./agent-repository.js";
import { SqliteApiKeyRepository } from "./api-key-repository.js";
import { SqliteAuditLogRepository } from "./audit-log-repository.js";
import { SqliteConnectorEventRepository } from "./connector-event-repository.js";
import { SqliteConnectorRepository } from "./connector-repository.js";
import { openDatabase } from "./db.js";
import { SqliteExecutionRepository } from "./execution-repository.js";
import { DatabaseHealthCheck } from "./health-check.js";
import { SqliteJobRepository } from "./job-repository.js";
import { SqliteMessageRepository } from "./message-repository.js";
import { runMigrations } from "./migrate.js";
import { SqliteRunRepository } from "./run-repository.js";

export interface StorageBundle {
  agents: SqliteAgentRepository;
  runs: SqliteRunRepository;
  messages: SqliteMessageRepository;
  apiKeys: SqliteApiKeyRepository;
  auditLogs: SqliteAuditLogRepository;
  jobs: SqliteJobRepository;
  executions: SqliteExecutionRepository;
  connectors: SqliteConnectorRepository;
  connectorEvents: SqliteConnectorEventRepository;
  healthCheck: DatabaseHealthCheck;
  close(): void;
}

export function createStorage(url: string): StorageBundle {
  const db = openDatabase(url);
  runMigrations(db);
  let closed = false;

  return {
    agents: new SqliteAgentRepository(db),
    runs: new SqliteRunRepository(db),
    messages: new SqliteMessageRepository(db),
    apiKeys: new SqliteApiKeyRepository(db),
    auditLogs: new SqliteAuditLogRepository(db),
    jobs: new SqliteJobRepository(db),
    executions: new SqliteExecutionRepository(db),
    connectors: new SqliteConnectorRepository(db),
    connectorEvents: new SqliteConnectorEventRepository(db),
    healthCheck: new DatabaseHealthCheck(() => {
      db.$client.prepare("select 1 as ok").get();
    }),
    close: () => {
      if (closed) {
        return;
      }
      closed = true;
      db.$client.close();
    },
  };
}

export {
  computeApiKeyLookupHash,
  generateApiKey,
  hashApiKey,
  isValidApiKeyFormat,
  verifyApiKey,
} from "./api-key-crypto.js";
export { SqliteApiKeyRepository } from "./api-key-repository.js";
export { SqliteAuditLogRepository } from "./audit-log-repository.js";
export { DatabaseHealthCheck } from "./health-check.js";
export { openDatabase } from "./db.js";
export { runMigrations } from "./migrate.js";
export { SqliteAgentRepository } from "./agent-repository.js";
export { SqliteRunRepository } from "./run-repository.js";
export { SqliteMessageRepository } from "./message-repository.js";
export { SqliteJobRepository } from "./job-repository.js";
export { SqliteExecutionRepository } from "./execution-repository.js";
export { SqliteConnectorRepository } from "./connector-repository.js";
export { SqliteConnectorEventRepository } from "./connector-event-repository.js";
export * from "./serialization.js";
