import type { IMessageRepository, Message } from "@senclaw/protocol";
import { asc, eq } from "drizzle-orm";
import type { StorageDatabase } from "./db.js";
import { observeDbQuery } from "./metrics.js";
import { messagesTable } from "./schema.js";
import { deserializeToolCalls, serializeToolCalls } from "./serialization.js";

function mapMessage(row: typeof messagesTable.$inferSelect): Message {
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

export class SqliteMessageRepository implements IMessageRepository {
  constructor(private readonly db: StorageDatabase) {}

  async append(runId: string, message: Message): Promise<void> {
    const row: typeof messagesTable.$inferInsert = {
      runId,
      role: message.role,
      content: "content" in message ? (message.content ?? null) : null,
      toolCalls:
        message.role === "assistant"
          ? serializeToolCalls(message.toolCalls)
          : null,
      toolCallId: message.role === "tool" ? message.toolCallId : null,
      insertedAt: new Date().toISOString(),
    };

    observeDbQuery("insert", () =>
      this.db.insert(messagesTable).values(row).run(),
    );
  }

  async listByRunId(runId: string): Promise<Message[]> {
    return observeDbQuery("select", () =>
      this.db
        .select()
        .from(messagesTable)
        .where(eq(messagesTable.runId, runId))
        .orderBy(asc(messagesTable.seq))
        .all()
        .map(mapMessage),
    );
  }
}
