import type {
  AgentTranscriptEntry,
  IAgentTaskMessageRepository,
  Message,
} from "@senclaw/protocol";
import { asc, eq } from "drizzle-orm";
import type { StorageDatabase } from "./db.js";
import { observeDbQuery } from "./metrics.js";
import { agentTaskMessagesTable, agentTasksTable } from "./schema.js";
import { deserializeToolCalls, serializeToolCalls } from "./serialization.js";

function mapMessage(row: typeof agentTaskMessagesTable.$inferSelect): Message {
  if (row.role === "system" || row.role === "user") {
    return {
      role: row.role,
      content: row.content ?? "",
    };
  }

  if (row.role === "assistant") {
    return {
      role: "assistant",
      content: row.content ?? undefined,
      toolCalls: deserializeToolCalls(row.toolCalls),
    };
  }

  return {
    role: "tool",
    toolCallId: row.toolCallId ?? "",
    content: row.content ?? "",
  };
}

function mapEntry(
  row: typeof agentTaskMessagesTable.$inferSelect,
): AgentTranscriptEntry {
  return {
    seq: row.seq,
    taskId: row.taskId,
    sourceRunId: row.sourceRunId ?? undefined,
    message: mapMessage(row),
    insertedAt: row.insertedAt,
  };
}

export class SqliteAgentTaskMessageRepository
  implements IAgentTaskMessageRepository
{
  constructor(private readonly db: StorageDatabase) {}

  async append(
    taskId: string,
    message: Message,
    sourceRunId?: string,
  ): Promise<AgentTranscriptEntry> {
    const insertedAt = new Date().toISOString();
    const row: typeof agentTaskMessagesTable.$inferInsert = {
      taskId,
      sourceRunId: sourceRunId ?? null,
      role: message.role,
      content: "content" in message ? (message.content ?? null) : null,
      toolCalls:
        message.role === "assistant"
          ? serializeToolCalls(message.toolCalls)
          : null,
      toolCallId: message.role === "tool" ? message.toolCallId : null,
      insertedAt,
    };

    const result = observeDbQuery("insert", () =>
      this.db.insert(agentTaskMessagesTable).values(row).run(),
    );
    const seq = Number(result.lastInsertRowid);

    observeDbQuery("update", () =>
      this.db
        .update(agentTasksTable)
        .set({ transcriptCursor: seq, updatedAt: insertedAt })
        .where(eq(agentTasksTable.id, taskId))
        .run(),
    );

    return {
      seq,
      taskId,
      sourceRunId,
      message,
      insertedAt,
    };
  }

  async listByTaskId(taskId: string): Promise<AgentTranscriptEntry[]> {
    return observeDbQuery("select", () =>
      this.db
        .select()
        .from(agentTaskMessagesTable)
        .where(eq(agentTaskMessagesTable.taskId, taskId))
        .orderBy(asc(agentTaskMessagesTable.seq))
        .all()
        .map(mapEntry),
    );
  }
}
