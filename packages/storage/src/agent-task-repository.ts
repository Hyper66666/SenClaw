import { randomUUID } from "node:crypto";
import type {
  AgentTask,
  AgentTaskStatus,
  CreateAgentTask,
  IAgentTaskRepository,
} from "@senclaw/protocol";
import { asc, eq } from "drizzle-orm";
import type { StorageDatabase } from "./db.js";
import { observeDbQuery } from "./metrics.js";
import { agentTasksTable } from "./schema.js";

function parseMetadata(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function mapAgentTask(row: typeof agentTasksTable.$inferSelect): AgentTask {
  return {
    id: row.id,
    selectedAgentId: row.selectedAgentId,
    status: row.status as AgentTaskStatus,
    initialInput: row.initialInput,
    background: row.background,
    parentRunId: row.parentRunId ?? undefined,
    parentTaskId: row.parentTaskId ?? undefined,
    activeRunId: row.activeRunId ?? undefined,
    transcript: {
      taskId: row.id,
      lastMessageSeq: row.transcriptCursor,
    },
    metadata: parseMetadata(row.metadata),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    error: row.error ?? undefined,
  };
}

export class SqliteAgentTaskRepository implements IAgentTaskRepository {
  constructor(private readonly db: StorageDatabase) {}

  async create(data: CreateAgentTask): Promise<AgentTask> {
    const now = new Date().toISOString();
    const task: typeof agentTasksTable.$inferInsert = {
      id: randomUUID(),
      selectedAgentId: data.selectedAgentId,
      status: "pending",
      initialInput: data.initialInput,
      background: data.background ?? true,
      parentRunId: data.parentRunId ?? null,
      parentTaskId: data.parentTaskId ?? null,
      activeRunId: null,
      transcriptCursor: 0,
      metadata: JSON.stringify(data.metadata ?? {}),
      createdAt: now,
      updatedAt: now,
      error: null,
    };

    observeDbQuery("insert", () =>
      this.db.insert(agentTasksTable).values(task).run(),
    );
    return mapAgentTask(task as typeof agentTasksTable.$inferSelect);
  }

  async get(id: string): Promise<AgentTask | undefined> {
    const row = observeDbQuery("select", () =>
      this.db
        .select()
        .from(agentTasksTable)
        .where(eq(agentTasksTable.id, id))
        .get(),
    );
    return row ? mapAgentTask(row) : undefined;
  }

  async list(): Promise<AgentTask[]> {
    return observeDbQuery("select", () =>
      this.db
        .select()
        .from(agentTasksTable)
        .orderBy(asc(agentTasksTable.createdAt))
        .all()
        .map(mapAgentTask),
    );
  }

  async updateStatus(
    id: string,
    status: AgentTaskStatus,
    error?: string,
  ): Promise<AgentTask | undefined> {
    const existing = await this.get(id);
    if (!existing) {
      return undefined;
    }

    observeDbQuery("update", () =>
      this.db
        .update(agentTasksTable)
        .set({
          status,
          updatedAt: new Date().toISOString(),
          error: error ?? existing.error ?? null,
        })
        .where(eq(agentTasksTable.id, id))
        .run(),
    );

    return this.get(id);
  }

  async setActiveRun(
    id: string,
    activeRunId?: string,
  ): Promise<AgentTask | undefined> {
    const existing = await this.get(id);
    if (!existing) {
      return undefined;
    }

    observeDbQuery("update", () =>
      this.db
        .update(agentTasksTable)
        .set({
          activeRunId: activeRunId ?? null,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(agentTasksTable.id, id))
        .run(),
    );

    return this.get(id);
  }
}
