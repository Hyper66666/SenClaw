import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import type { IRunRepository, Run, RunStatus } from "@senclaw/protocol";
import type { StorageDatabase } from "./db.js";
import { observeDbQuery } from "./metrics.js";
import { runsTable } from "./schema.js";

function mapRun(row: typeof runsTable.$inferSelect): Run {
  return {
    id: row.id,
    agentId: row.agentId,
    input: row.input,
    status: row.status as RunStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    error: row.error ?? undefined,
  };
}

export class SqliteRunRepository implements IRunRepository {
  constructor(private readonly db: StorageDatabase) {}

  async create(agentId: string, input: string): Promise<Run> {
    const now = new Date().toISOString();
    const run: typeof runsTable.$inferInsert = {
      id: randomUUID(),
      agentId,
      input,
      status: "pending",
      createdAt: now,
      updatedAt: now,
      error: null,
    };

    observeDbQuery("insert", () => this.db.insert(runsTable).values(run).run());
    return mapRun(run as typeof runsTable.$inferSelect);
  }

  async get(id: string): Promise<Run | undefined> {
    const row = observeDbQuery("select", () =>
      this.db.select().from(runsTable).where(eq(runsTable.id, id)).get(),
    );
    return row ? mapRun(row) : undefined;
  }

  async list(): Promise<Run[]> {
    return observeDbQuery("select", () =>
      this.db
        .select()
        .from(runsTable)
        .orderBy(asc(runsTable.createdAt))
        .all()
        .map(mapRun),
    );
  }

  async updateStatus(
    id: string,
    status: RunStatus,
    error?: string,
  ): Promise<Run | undefined> {
    const existing = await this.get(id);
    if (!existing) {
      return undefined;
    }

    observeDbQuery("update", () =>
      this.db
        .update(runsTable)
        .set({
          status,
          updatedAt: new Date().toISOString(),
          error: error ?? existing.error ?? null,
        })
        .where(eq(runsTable.id, id))
        .run(),
    );

    return this.get(id);
  }
}
