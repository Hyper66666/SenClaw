import { randomUUID } from "node:crypto";
import type {
  CreateJobExecution,
  IExecutionRepository,
  JobExecution,
  JobExecutionStatus,
} from "@senclaw/protocol";
import { and, desc, eq, or } from "drizzle-orm";
import type { StorageDatabase } from "./db.js";
import { observeDbQuery } from "./metrics.js";
import { jobExecutionsTable, runsTable } from "./schema.js";

function mapExecution(
  row: typeof jobExecutionsTable.$inferSelect,
): JobExecution {
  return {
    id: row.id,
    jobId: row.jobId,
    runId: row.runId ?? undefined,
    status: row.status as JobExecutionStatus,
    scheduledAt: row.scheduledAt,
    executedAt: row.executedAt ?? undefined,
    error: row.error ?? undefined,
  };
}

export class SqliteExecutionRepository implements IExecutionRepository {
  constructor(private readonly db: StorageDatabase) {}

  async create(data: CreateJobExecution): Promise<JobExecution> {
    const execution: typeof jobExecutionsTable.$inferInsert = {
      id: randomUUID(),
      jobId: data.jobId,
      runId: data.runId ?? null,
      status: data.status,
      scheduledAt: data.scheduledAt.toISOString(),
      executedAt: data.executedAt?.toISOString() ?? null,
      error: data.error ?? null,
    };

    observeDbQuery("insert", () =>
      this.db.insert(jobExecutionsTable).values(execution).run(),
    );
    return mapExecution(execution as typeof jobExecutionsTable.$inferSelect);
  }

  async get(id: string): Promise<JobExecution | undefined> {
    const row = observeDbQuery("select", () =>
      this.db
        .select()
        .from(jobExecutionsTable)
        .where(eq(jobExecutionsTable.id, id))
        .get(),
    );
    return row ? mapExecution(row) : undefined;
  }

  async listByJobId(
    jobId: string,
    limit = 50,
    offset = 0,
  ): Promise<JobExecution[]> {
    return observeDbQuery("select", () =>
      this.db
        .select()
        .from(jobExecutionsTable)
        .where(eq(jobExecutionsTable.jobId, jobId))
        .orderBy(jobExecutionsTable.scheduledAt)
        .limit(limit)
        .offset(offset)
        .all()
        .map(mapExecution),
    );
  }

  async updateStatus(
    id: string,
    status: JobExecutionStatus,
    runId?: string,
    error?: string,
  ): Promise<void> {
    const updates: Partial<typeof jobExecutionsTable.$inferInsert> = {
      status,
    };
    if (runId !== undefined) updates.runId = runId;
    if (error !== undefined) updates.error = error;

    observeDbQuery("update", () =>
      this.db
        .update(jobExecutionsTable)
        .set(updates)
        .where(eq(jobExecutionsTable.id, id))
        .run(),
    );
  }

  async hasRunningExecution(jobId: string): Promise<boolean> {
    const execution = observeDbQuery("select", () =>
      this.db
        .select({ id: jobExecutionsTable.id })
        .from(jobExecutionsTable)
        .innerJoin(runsTable, eq(jobExecutionsTable.runId, runsTable.id))
        .where(
          and(
            eq(jobExecutionsTable.jobId, jobId),
            eq(jobExecutionsTable.status, "submitted"),
            or(
              eq(runsTable.status, "pending"),
              eq(runsTable.status, "running"),
            ),
          ),
        )
        .get(),
    );

    return execution !== undefined;
  }

  async countRecentFailures(jobId: string, limit: number): Promise<number> {
    const recentExecutions = observeDbQuery("select", () =>
      this.db
        .select({ status: jobExecutionsTable.status })
        .from(jobExecutionsTable)
        .where(eq(jobExecutionsTable.jobId, jobId))
        .orderBy(desc(jobExecutionsTable.scheduledAt))
        .limit(limit)
        .all(),
    );

    return recentExecutions.filter((execution) => execution.status === "failed")
      .length;
  }
}
