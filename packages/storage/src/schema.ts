import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const agentsTable = sqliteTable("agents", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  systemPrompt: text("system_prompt").notNull(),
  provider: text("provider").notNull(),
  tools: text("tools").notNull(),
});

export const runsTable = sqliteTable("runs", {
  id: text("id").primaryKey(),
  agentId: text("agent_id").notNull(),
  input: text("input").notNull(),
  status: text("status").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  error: text("error"),
});

export const messagesTable = sqliteTable(
  "messages",
  {
    seq: integer("seq").primaryKey({ autoIncrement: true }),
    runId: text("run_id").notNull(),
    role: text("role").notNull(),
    content: text("content"),
    toolCalls: text("tool_calls"),
    toolCallId: text("tool_call_id"),
    insertedAt: text("inserted_at").notNull(),
  },
  (table) => ({
    runIdIdx: index("messages_run_id_idx").on(table.runId),
  }),
);

export const apiKeysTable = sqliteTable(
  "api_keys",
  {
    id: text("id").primaryKey(),
    lookupHash: text("lookup_hash").notNull(),
    keyHash: text("key_hash").notNull(),
    name: text("name").notNull(),
    role: text("role").notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: text("created_at").notNull(),
    expiresAt: text("expires_at"),
    lastUsedAt: text("last_used_at"),
    revokedAt: text("revoked_at"),
    revokedBy: text("revoked_by"),
    revokedReason: text("revoked_reason"),
  },
  (table) => ({
    lookupHashIdx: uniqueIndex("api_keys_lookup_hash_idx").on(table.lookupHash),
    keyHashIdx: index("api_keys_key_hash_idx").on(table.keyHash),
    revokedAtIdx: index("api_keys_revoked_at_idx").on(table.revokedAt),
  }),
);

export const auditLogsTable = sqliteTable(
  "audit_logs",
  {
    id: text("id").primaryKey(),
    keyId: text("key_id")
      .notNull()
      .references(() => apiKeysTable.id, { onDelete: "cascade" }),
    method: text("method").notNull(),
    path: text("path").notNull(),
    status: integer("status").notNull(),
    ip: text("ip").notNull(),
    userAgent: text("user_agent"),
    requestBody: text("request_body"),
    responseTimeMs: integer("response_time_ms").notNull(),
    timestamp: text("timestamp").notNull(),
  },
  (table) => ({
    keyIdIdx: index("audit_logs_key_id_idx").on(table.keyId),
    timestampIdx: index("audit_logs_timestamp_idx").on(table.timestamp),
    statusIdx: index("audit_logs_status_idx").on(table.status),
  }),
);

export const scheduledJobsTable = sqliteTable(
  "scheduled_jobs",
  {
    id: text("id").primaryKey(),
    agentId: text("agent_id")
      .notNull()
      .references(() => agentsTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    cronExpression: text("cron_expression").notNull(),
    input: text("input").notNull(),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    allowConcurrent: integer("allow_concurrent", { mode: "boolean" })
      .notNull()
      .default(false),
    timezone: text("timezone").notNull().default("UTC"),
    maxRetries: integer("max_retries").notNull().default(0),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    lastRunAt: text("last_run_at"),
    nextRunAt: text("next_run_at"),
  },
  (table) => ({
    agentIdIdx: index("scheduled_jobs_agent_id_idx").on(table.agentId),
    enabledIdx: index("scheduled_jobs_enabled_idx").on(table.enabled),
    nextRunAtIdx: index("scheduled_jobs_next_run_at_idx").on(table.nextRunAt),
  }),
);

export const jobExecutionsTable = sqliteTable(
  "job_executions",
  {
    id: text("id").primaryKey(),
    jobId: text("job_id")
      .notNull()
      .references(() => scheduledJobsTable.id, { onDelete: "cascade" }),
    runId: text("run_id").references(() => runsTable.id, {
      onDelete: "set null",
    }),
    status: text("status").notNull(),
    scheduledAt: text("scheduled_at").notNull(),
    executedAt: text("executed_at"),
    error: text("error"),
  },
  (table) => ({
    jobIdIdx: index("job_executions_job_id_idx").on(table.jobId),
    scheduledAtIdx: index("job_executions_scheduled_at_idx").on(
      table.scheduledAt,
    ),
    statusIdx: index("job_executions_status_idx").on(table.status),
  }),
);

export const connectorsTable = sqliteTable(
  "connectors",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    type: text("type").notNull(), // 'webhook', 'queue', 'polling'
    agentId: text("agent_id")
      .notNull()
      .references(() => agentsTable.id, { onDelete: "cascade" }),
    config: text("config").notNull(), // JSON: connector-specific configuration
    transformation: text("transformation").notNull(), // JSON: event-to-task mapping
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    lastEventAt: text("last_event_at"),
  },
  (table) => ({
    typeIdx: index("connectors_type_idx").on(table.type),
    enabledIdx: index("connectors_enabled_idx").on(table.enabled),
    agentIdIdx: index("connectors_agent_id_idx").on(table.agentId),
  }),
);

export const connectorEventsTable = sqliteTable(
  "connector_events",
  {
    id: text("id").primaryKey(),
    connectorId: text("connector_id")
      .notNull()
      .references(() => connectorsTable.id, { onDelete: "cascade" }),
    payload: text("payload").notNull(), // JSON: raw event payload
    transformedInput: text("transformed_input"), // extracted task input
    status: text("status").notNull(), // 'pending', 'submitted', 'failed', 'filtered'
    runId: text("run_id").references(() => runsTable.id, {
      onDelete: "set null",
    }),
    error: text("error"),
    receivedAt: text("received_at").notNull(),
    processedAt: text("processed_at"),
  },
  (table) => ({
    connectorIdIdx: index("connector_events_connector_id_idx").on(
      table.connectorId,
    ),
    statusIdx: index("connector_events_status_idx").on(table.status),
    receivedAtIdx: index("connector_events_received_at_idx").on(
      table.receivedAt,
    ),
  }),
);

export const schema = {
  agentsTable,
  runsTable,
  messagesTable,
  apiKeysTable,
  auditLogsTable,
  scheduledJobsTable,
  jobExecutionsTable,
  connectorsTable,
  connectorEventsTable,
};
