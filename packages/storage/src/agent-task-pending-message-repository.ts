import { randomUUID } from "node:crypto";
import type {
  AgentTaskPendingMessage,
  CreateAgentTaskPendingMessage,
  IAgentTaskPendingMessageRepository,
} from "@senclaw/protocol";
import { and, asc, eq, isNull } from "drizzle-orm";
import type { StorageDatabase } from "./db.js";
import { observeDbQuery } from "./metrics.js";
import { agentTaskPendingMessagesTable } from "./schema.js";

function mapPending(
  row: typeof agentTaskPendingMessagesTable.$inferSelect,
): AgentTaskPendingMessage {
  return {
    id: row.id,
    taskId: row.taskId,
    role: row.role as AgentTaskPendingMessage["role"],
    content: row.content,
    createdAt: row.createdAt,
    deliveredAt: row.deliveredAt ?? undefined,
  };
}

export class SqliteAgentTaskPendingMessageRepository
  implements IAgentTaskPendingMessageRepository
{
  constructor(private readonly db: StorageDatabase) {}

  async enqueue(
    data: CreateAgentTaskPendingMessage,
  ): Promise<AgentTaskPendingMessage> {
    const row: typeof agentTaskPendingMessagesTable.$inferInsert = {
      id: randomUUID(),
      taskId: data.taskId,
      role: data.role,
      content: data.content,
      createdAt: new Date().toISOString(),
      deliveredAt: null,
    };

    observeDbQuery("insert", () =>
      this.db.insert(agentTaskPendingMessagesTable).values(row).run(),
    );
    return mapPending(row as typeof agentTaskPendingMessagesTable.$inferSelect);
  }

  async listPendingByTaskId(
    taskId: string,
  ): Promise<AgentTaskPendingMessage[]> {
    return observeDbQuery("select", () =>
      this.db
        .select()
        .from(agentTaskPendingMessagesTable)
        .where(
          and(
            eq(agentTaskPendingMessagesTable.taskId, taskId),
            isNull(agentTaskPendingMessagesTable.deliveredAt),
          ),
        )
        .orderBy(asc(agentTaskPendingMessagesTable.createdAt))
        .all()
        .map(mapPending),
    );
  }

  async markDelivered(
    id: string,
  ): Promise<AgentTaskPendingMessage | undefined> {
    const existing = observeDbQuery("select", () =>
      this.db
        .select()
        .from(agentTaskPendingMessagesTable)
        .where(eq(agentTaskPendingMessagesTable.id, id))
        .get(),
    );
    if (!existing) {
      return undefined;
    }

    const deliveredAt = new Date().toISOString();
    observeDbQuery("update", () =>
      this.db
        .update(agentTaskPendingMessagesTable)
        .set({ deliveredAt })
        .where(eq(agentTaskPendingMessagesTable.id, id))
        .run(),
    );

    return mapPending({ ...existing, deliveredAt });
  }
}
