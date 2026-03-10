# Job Persistence Specification

## Overview

Job persistence stores scheduled jobs and execution history in SQLite, ensuring jobs survive scheduler restarts and providing audit trails.

## Database Schema

### Scheduled Jobs Table

```sql
CREATE TABLE scheduled_jobs (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  name TEXT NOT NULL,
  cron_expression TEXT NOT NULL,
  input TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  allow_concurrent INTEGER NOT NULL DEFAULT 0,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  max_retries INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_run_at TEXT,
  next_run_at TEXT,
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
);

CREATE INDEX idx_scheduled_jobs_agent_id ON scheduled_jobs(agent_id);
CREATE INDEX idx_scheduled_jobs_enabled ON scheduled_jobs(enabled);
CREATE INDEX idx_scheduled_jobs_next_run_at ON scheduled_jobs(next_run_at);
```

### Job Executions Table

```sql
CREATE TABLE job_executions (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  run_id TEXT,
  status TEXT NOT NULL, -- 'submitted', 'completed', 'failed', 'skipped'
  scheduled_at TEXT NOT NULL,
  executed_at TEXT,
  completed_at TEXT,
  error TEXT,
  FOREIGN KEY (job_id) REFERENCES scheduled_jobs(id) ON DELETE CASCADE,
  FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE SET NULL
);

CREATE INDEX idx_job_executions_job_id ON job_executions(job_id);
CREATE INDEX idx_job_executions_status ON job_executions(status);
CREATE INDEX idx_job_executions_scheduled_at ON job_executions(scheduled_at);
```

## Repository Interface

```typescript
export interface IJobRepository {
  create(data: CreateScheduledJob): Promise<ScheduledJob>;
  get(id: string): Promise<ScheduledJob | null>;
  list(filters?: JobFilters): Promise<ScheduledJob[]>;
  update(id: string, data: Partial<ScheduledJob>): Promise<ScheduledJob>;
  delete(id: string): Promise<void>;
  findDueJobs(now: Date): Promise<ScheduledJob[]>;
}

export interface IExecutionRepository {
  create(data: CreateJobExecution): Promise<JobExecution>;
  listByJobId(jobId: string, options?: PaginationOptions): Promise<JobExecution[]>;
  countByJobId(jobId: string): Promise<number>;
  hasRunningExecution(jobId: string): Promise<boolean>;
  countRecentFailures(jobId: string, limit: number): Promise<number>;
}
```

## Implementation

### Job Repository

```typescript
import { eq, and, lte, isNotNull } from 'drizzle-orm';
import type { IJobRepository, ScheduledJob, CreateScheduledJob } from '@senclaw/protocol';
import { db } from './db';
import { scheduledJobs } from './schema';

export class SqliteJobRepository implements IJobRepository {
  async create(data: CreateScheduledJob): Promise<ScheduledJob> {
    await db.insert(scheduledJobs).values(data);
    return this.get(data.id) as Promise<ScheduledJob>;
  }

  async get(id: string): Promise<ScheduledJob | null> {
    const result = await db
      .select()
      .from(scheduledJobs)
      .where(eq(scheduledJobs.id, id))
      .get();

    return result || null;
  }

  async list(filters?: JobFilters): Promise<ScheduledJob[]> {
    let query = db.select().from(scheduledJobs);

    const conditions = [];

    if (filters?.agentId) {
      conditions.push(eq(scheduledJobs.agentId, filters.agentId));
    }

    if (filters?.enabled !== undefined) {
      conditions.push(eq(scheduledJobs.enabled, filters.enabled ? 1 : 0));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    return query.all();
  }

  async update(id: string, data: Partial<ScheduledJob>): Promise<ScheduledJob> {
    await db
      .update(scheduledJobs)
      .set({ ...data, updatedAt: new Date().toISOString() })
      .where(eq(scheduledJobs.id, id));

    return this.get(id) as Promise<ScheduledJob>;
  }

  async delete(id: string): Promise<void> {
    await db.delete(scheduledJobs).where(eq(scheduledJobs.id, id));
  }

  async findDueJobs(now: Date): Promise<ScheduledJob[]> {
    return db
      .select()
      .from(scheduledJobs)
      .where(
        and(
          eq(scheduledJobs.enabled, 1),
          isNotNull(scheduledJobs.nextRunAt),
          lte(scheduledJobs.nextRunAt, now.toISOString())
        )
      )
      .all();
  }
}
```

### Execution Repository

```typescript
export class SqliteExecutionRepository implements IExecutionRepository {
  async create(data: CreateJobExecution): Promise<JobExecution> {
    await db.insert(jobExecutions).values(data);
    return this.get(data.id) as Promise<JobExecution>;
  }

  async listByJobId(
    jobId: string,
    options?: PaginationOptions
  ): Promise<JobExecution[]> {
    const { limit = 100, offset = 0 } = options || {};

    return db
      .select()
      .from(jobExecutions)
      .where(eq(jobExecutions.jobId, jobId))
      .orderBy(desc(jobExecutions.scheduledAt))
      .limit(limit)
      .offset(offset)
      .all();
  }

  async countByJobId(jobId: string): Promise<number> {
    const result = await db
      .select({ count: count() })
      .from(jobExecutions)
      .where(eq(jobExecutions.jobId, jobId))
      .get();

    return result?.count || 0;
  }

  async hasRunningExecution(jobId: string): Promise<boolean> {
    // Check if any execution is in 'submitted' status and corresponding run is still active
    const executions = await db
      .select()
      .from(jobExecutions)
      .where(
        and(
          eq(jobExecutions.jobId, jobId),
          eq(jobExecutions.status, 'submitted')
        )
      )
      .all();

    for (const execution of executions) {
      if (!execution.runId) continue;

      const run = await db
        .select()
        .from(runs)
        .where(eq(runs.id, execution.runId))
        .get();

      if (run && (run.status === 'pending' || run.status === 'running')) {
        return true;
      }
    }

    return false;
  }

  async countRecentFailures(jobId: string, limit: number): Promise<number> {
    const recentExecutions = await db
      .select()
      .from(jobExecutions)
      .where(eq(jobExecutions.jobId, jobId))
      .orderBy(desc(jobExecutions.scheduledAt))
      .limit(limit)
      .all();

    return recentExecutions.filter(e => e.status === 'failed').length;
  }
}
```

## Data Types

```typescript
export interface ScheduledJob {
  id: string;
  agentId: string;
  name: string;
  cronExpression: string;
  input: string;
  enabled: boolean;
  allowConcurrent: boolean;
  timezone: string;
  maxRetries: number;
  createdAt: string;
  updatedAt: string;
  lastRunAt: string | null;
  nextRunAt: string | null;
}

export interface JobExecution {
  id: string;
  jobId: string;
  runId: string | null;
  status: 'submitted' | 'completed' | 'failed' | 'skipped';
  scheduledAt: string;
  executedAt: string | null;
  completedAt: string | null;
  error: string | null;
}
```

## Cascade Deletion

When an agent is deleted, all its scheduled jobs are deleted (CASCADE):

```sql
FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
```

When a job is deleted, all its executions are deleted (CASCADE):

```sql
FOREIGN KEY (job_id) REFERENCES scheduled_jobs(id) ON DELETE CASCADE
```

When a run is deleted, execution's run_id is set to NULL (SET NULL):

```sql
FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE SET NULL
```

## Testing

```typescript
describe('Job Repository', () => {
  it('creates scheduled job', async () => {
    const job = await jobRepo.create({
      id: 'job-123',
      agentId: 'agent-456',
      name: 'Daily Report',
      cronExpression: '0 9 * * *',
      input: 'Generate report',
      enabled: true,
      allowConcurrent: false,
      timezone: 'UTC',
      maxRetries: 3,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      nextRunAt: new Date('2026-03-11T09:00:00Z').toISOString(),
    });

    expect(job.id).toBe('job-123');
    expect(job.name).toBe('Daily Report');
  });

  it('finds due jobs', async () => {
    await jobRepo.create({
      id: 'job-1',
      agentId: 'agent-1',
      name: 'Job 1',
      cronExpression: '0 9 * * *',
      input: 'test',
      enabled: true,
      allowConcurrent: false,
      timezone: 'UTC',
      maxRetries: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      nextRunAt: new Date('2026-03-10T09:00:00Z').toISOString(),
    });

    const now = new Date('2026-03-10T09:05:00Z');
    const dueJobs = await jobRepo.findDueJobs(now);

    expect(dueJobs).toHaveLength(1);
    expect(dueJobs[0].id).toBe('job-1');
  });

  it('updates job', async () => {
    const job = await createTestJob();

    const updated = await jobRepo.update(job.id, {
      enabled: false,
      cronExpression: '0 10 * * *',
    });

    expect(updated.enabled).toBe(false);
    expect(updated.cronExpression).toBe('0 10 * * *');
  });

  it('deletes job', async () => {
    const job = await createTestJob();

    await jobRepo.delete(job.id);

    const found = await jobRepo.get(job.id);
    expect(found).toBeNull();
  });
});

describe('Execution Repository', () => {
  it('creates execution', async () => {
    const execution = await executionRepo.create({
      id: 'exec-123',
      jobId: 'job-456',
      runId: 'run-789',
      status: 'submitted',
      scheduledAt: new Date().toISOString(),
      executedAt: new Date().toISOString(),
    });

    expect(execution.id).toBe('exec-123');
    expect(execution.status).toBe('submitted');
  });

  it('checks for running execution', async () => {
    const job = await createTestJob();
    const run = await createTestRun({ status: 'running' });

    await executionRepo.create({
      id: 'exec-1',
      jobId: job.id,
      runId: run.id,
      status: 'submitted',
      scheduledAt: new Date().toISOString(),
      executedAt: new Date().toISOString(),
    });

    const hasRunning = await executionRepo.hasRunningExecution(job.id);
    expect(hasRunning).toBe(true);
  });

  it('counts recent failures', async () => {
    const job = await createTestJob();

    // Create 3 failed executions
    for (let i = 0; i < 3; i++) {
      await executionRepo.create({
        id: `exec-${i}`,
        jobId: job.id,
        runId: null,
        status: 'failed',
        scheduledAt: new Date().toISOString(),
        executedAt: new Date().toISOString(),
        error: 'Test error',
      });
    }

    const failures = await executionRepo.countRecentFailures(job.id, 5);
    expect(failures).toBe(3);
  });
});
```

## Best Practices

1. **Use transactions** for job creation + next run calculation
2. **Index next_run_at** for efficient due job queries
3. **Cascade delete** to maintain referential integrity
4. **Store times in UTC** always
5. **Paginate execution history** (can grow large)
6. **Clean up old executions** periodically (e.g., > 90 days)
7. **Use foreign keys** to prevent orphaned records
8. **Validate agent exists** before creating job
