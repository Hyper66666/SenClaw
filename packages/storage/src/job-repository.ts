import { randomUUID } from "node:crypto";
import type {
  CreateScheduledJob,
  IJobRepository,
  ScheduledJob,
  UpdateScheduledJob,
} from "@senclaw/protocol";
import { calculateNextRun } from "@senclaw/scheduler";
import { and, eq, lte } from "drizzle-orm";
import type { StorageDatabase } from "./db.js";
import { observeDbQuery } from "./metrics.js";
import { scheduledJobsTable } from "./schema.js";

function mapJob(row: typeof scheduledJobsTable.$inferSelect): ScheduledJob {
  return {
    id: row.id,
    agentId: row.agentId,
    name: row.name,
    cronExpression: row.cronExpression,
    input: row.input,
    enabled: row.enabled,
    allowConcurrent: row.allowConcurrent,
    timezone: row.timezone,
    maxRetries: row.maxRetries,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    lastRunAt: row.lastRunAt ?? undefined,
    nextRunAt: row.nextRunAt ?? undefined,
  };
}

export class SqliteJobRepository implements IJobRepository {
  constructor(private readonly db: StorageDatabase) {}

  async create(data: CreateScheduledJob): Promise<ScheduledJob> {
    const now = new Date().toISOString();
    const nextRunAt = calculateNextRun(
      data.cronExpression,
      data.timezone ?? "UTC",
    );

    const job: typeof scheduledJobsTable.$inferInsert = {
      id: randomUUID(),
      agentId: data.agentId,
      name: data.name,
      cronExpression: data.cronExpression,
      input: data.input,
      enabled: true,
      allowConcurrent: data.allowConcurrent ?? false,
      timezone: data.timezone ?? "UTC",
      maxRetries: data.maxRetries ?? 0,
      createdAt: now,
      updatedAt: now,
      lastRunAt: null,
      nextRunAt,
    };

    observeDbQuery("insert", () =>
      this.db.insert(scheduledJobsTable).values(job).run(),
    );
    return mapJob(job as typeof scheduledJobsTable.$inferSelect);
  }

  async get(id: string): Promise<ScheduledJob | undefined> {
    const row = observeDbQuery("select", () =>
      this.db
        .select()
        .from(scheduledJobsTable)
        .where(eq(scheduledJobsTable.id, id))
        .get(),
    );
    return row ? mapJob(row) : undefined;
  }

  async list(filters?: {
    agentId?: string;
    enabled?: boolean;
  }): Promise<ScheduledJob[]> {
    const conditions: ReturnType<typeof eq>[] = [];
    if (filters?.agentId) {
      conditions.push(eq(scheduledJobsTable.agentId, filters.agentId));
    }
    if (filters?.enabled !== undefined) {
      conditions.push(eq(scheduledJobsTable.enabled, filters.enabled));
    }

    return observeDbQuery("select", () => {
      let query = this.db.select().from(scheduledJobsTable);
      if (conditions.length > 0) {
        query = query.where(and(...conditions)) as typeof query;
      }
      return query.all().map(mapJob);
    });
  }

  async update(
    id: string,
    data: UpdateScheduledJob,
  ): Promise<ScheduledJob | undefined> {
    const existing = observeDbQuery("select", () =>
      this.db
        .select()
        .from(scheduledJobsTable)
        .where(eq(scheduledJobsTable.id, id))
        .get(),
    );
    if (!existing) {
      return undefined;
    }

    const updates: Partial<typeof scheduledJobsTable.$inferInsert> = {
      updatedAt: new Date().toISOString(),
    };

    if (data.name !== undefined) updates.name = data.name;
    if (data.input !== undefined) updates.input = data.input;
    if (data.enabled !== undefined) updates.enabled = data.enabled;
    if (data.allowConcurrent !== undefined)
      updates.allowConcurrent = data.allowConcurrent;
    if (data.timezone !== undefined) updates.timezone = data.timezone;
    if (data.maxRetries !== undefined) updates.maxRetries = data.maxRetries;

    if (data.cronExpression !== undefined || data.timezone !== undefined) {
      const cronExpression = data.cronExpression ?? existing.cronExpression;
      const timezone = data.timezone ?? existing.timezone;

      updates.cronExpression = cronExpression;
      updates.nextRunAt = calculateNextRun(cronExpression, timezone);
    }

    observeDbQuery("update", () =>
      this.db
        .update(scheduledJobsTable)
        .set(updates)
        .where(eq(scheduledJobsTable.id, id))
        .run(),
    );

    return this.get(id);
  }

  async delete(id: string): Promise<boolean> {
    const result = observeDbQuery("delete", () =>
      this.db
        .delete(scheduledJobsTable)
        .where(eq(scheduledJobsTable.id, id))
        .run(),
    );
    return result.changes > 0;
  }

  async disable(id: string): Promise<void> {
    observeDbQuery("update", () =>
      this.db
        .update(scheduledJobsTable)
        .set({
          enabled: false,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(scheduledJobsTable.id, id))
        .run(),
    );
  }

  async findDueJobs(now: Date): Promise<ScheduledJob[]> {
    return observeDbQuery("select", () =>
      this.db
        .select()
        .from(scheduledJobsTable)
        .where(
          and(
            eq(scheduledJobsTable.enabled, true),
            lte(scheduledJobsTable.nextRunAt, now.toISOString()),
          ),
        )
        .all()
        .map(mapJob),
    );
  }

  async updateNextRun(
    id: string,
    lastRunAt: Date,
    nextRunAt: Date,
  ): Promise<void> {
    observeDbQuery("update", () =>
      this.db
        .update(scheduledJobsTable)
        .set({
          lastRunAt: lastRunAt.toISOString(),
          nextRunAt: nextRunAt.toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(scheduledJobsTable.id, id))
        .run(),
    );
  }
}
