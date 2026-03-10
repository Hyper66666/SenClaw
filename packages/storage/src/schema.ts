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

export const schema = {
  agentsTable,
  runsTable,
  messagesTable,
  apiKeysTable,
  auditLogsTable,
};
