# Scheduler — Design Document

## Overview

The Scheduler is a standalone service that manages time-based task execution for Senclaw agents. It evaluates cron expressions, submits tasks to agents, and tracks execution history.

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    Scheduler Service                      │
│  ┌────────────────────────────────────────────────────┐  │
│  │         Scheduler Loop (setInterval)               │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌─────────┐ │  │
│  │  │ Cron         │  │  Job         │  │ Task    │ │  │
│  │  │ Evaluator    │→ │  Executor    │→ │ Submit  │ │  │
│  │  └──────────────┘  └──────────────┘  └─────────┘ │  │
│  └────────────────────────────────────────────────────┘  │
│                          ↓                                │
│  ┌────────────────────────────────────────────────────┐  │
│  │         Job Repository (SQLite)                    │  │
│  │  jobs table: id, agent_id, cron, input, enabled   │  │
│  │  executions table: job_id, run_id, status, time   │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
                          ↓ HTTP
┌──────────────────────────────────────────────────────────┐
│                    Gateway (AgentService)                 │
│  POST /api/v1/tasks → submitTask(agentId, input)        │
└──────────────────────────────────────────────────────────┘
```

## Database Schema

### Jobs Table

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
```

### Executions Table

```sql
CREATE TABLE job_executions (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  run_id TEXT,
  status TEXT NOT NULL, -- 'submitted', 'completed', 'failed', 'skipped'
  scheduled_at TEXT NOT NULL,
  executed_at TEXT,
  error TEXT,
  FOREIGN KEY (job_id) REFERENCES scheduled_jobs(id) ON DELETE CASCADE,
  FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE SET NULL
);

CREATE INDEX idx_job_executions_job_id ON job_executions(job_id);
CREATE INDEX idx_job_executions_scheduled_at ON job_executions(scheduled_at);
```

## Cron Evaluation

### Cron Parser Integration

```typescript
import { parseExpression } from 'cron-parser';

function getNextRunTime(cronExpression: string, timezone: string): Date {
  const options = {
    currentDate: new Date(),
    tz: timezone,
  };
  const interval = parseExpression(cronExpression, options);
  return interval.next().toDate();
}
```

### Special Expressions

| Expression | Equivalent |
|------------|------------|
| `@hourly` | `0 * * * *` |
| `@daily` | `0 0 * * *` |
| `@weekly` | `0 0 * * 0` |
| `@monthly` | `0 0 1 * *` |
| `@yearly` | `0 0 1 1 *` |

## Scheduler Loop

### Tick-Based Evaluation

```typescript
export class Scheduler {
  private tickInterval = 10_000; // 10 seconds
  private timerId?: NodeJS.Timeout;

  async start() {
    this.timerId = setInterval(() => this.tick(), this.tickInterval);
    logger.info('Scheduler started');
  }

  async stop() {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = undefined;
    }
    logger.info('Scheduler stopped');
  }

  private async tick() {
    const now = new Date();
    const dueJobs = await this.jobRepo.findDueJobs(now);

    for (const job of dueJobs) {
      await this.executeJob(job, now);
    }
  }

  private async executeJob(job: ScheduledJob, scheduledAt: Date) {
    // Check if previous execution still running
    if (!job.allowConcurrent) {
      const running = await this.executionRepo.hasRunningExecution(job.id);
      if (running) {
        await this.executionRepo.create({
          jobId: job.id,
          status: 'skipped',
          scheduledAt,
          error: 'Previous execution still running',
        });
        return;
      }
    }

    try {
      // Submit task to agent
      const run = await this.agentService.submitTask(job.agentId, job.input);

      // Record execution
      await this.executionRepo.create({
        jobId: job.id,
        runId: run.id,
        status: 'submitted',
        scheduledAt,
        executedAt: new Date(),
      });

      // Update job's last/next run times
      const nextRun = getNextRunTime(job.cronExpression, job.timezone);
      await this.jobRepo.update(job.id, {
        lastRunAt: scheduledAt,
        nextRunAt: nextRun,
      });
    } catch (error) {
      await this.executionRepo.create({
        jobId: job.id,
        status: 'failed',
        scheduledAt,
        executedAt: new Date(),
        error: error instanceof Error ? error.message : String(error),
      });

      // Handle retries or disable job
      await this.handleFailure(job, error);
    }
  }

  private async handleFailure(job: ScheduledJob, error: unknown) {
    const recentFailures = await this.executionRepo.countRecentFailures(
      job.id,
      5 // last 5 executions
    );

    if (recentFailures >= 3) {
      // Disable job after 3 consecutive failures
      await this.jobRepo.update(job.id, { enabled: false });
      logger.error({ jobId: job.id }, 'Job disabled due to repeated failures');
    }
  }
}
```

## REST API Endpoints

### Create Job

```
POST /api/v1/jobs
Content-Type: application/json

{
  "agentId": "agent-123",
  "name": "Daily Report",
  "cronExpression": "0 9 * * *",
  "input": "Generate daily report",
  "timezone": "America/New_York",
  "allowConcurrent": false
}

Response: 201 Created
{
  "id": "job-456",
  "agentId": "agent-123",
  "name": "Daily Report",
  "cronExpression": "0 9 * * *",
  "input": "Generate daily report",
  "enabled": true,
  "timezone": "America/New_York",
  "nextRunAt": "2026-03-11T14:00:00.000Z"
}
```

### List Jobs

```
GET /api/v1/jobs?enabled=true&agentId=agent-123

Response: 200 OK
[
  {
    "id": "job-456",
    "name": "Daily Report",
    "cronExpression": "0 9 * * *",
    "enabled": true,
    "lastRunAt": "2026-03-10T14:00:00.000Z",
    "nextRunAt": "2026-03-11T14:00:00.000Z"
  }
]
```

### Get Job

```
GET /api/v1/jobs/:id

Response: 200 OK
{
  "id": "job-456",
  "agentId": "agent-123",
  "name": "Daily Report",
  "cronExpression": "0 9 * * *",
  "input": "Generate daily report",
  "enabled": true,
  "timezone": "America/New_York",
  "lastRunAt": "2026-03-10T14:00:00.000Z",
  "nextRunAt": "2026-03-11T14:00:00.000Z",
  "createdAt": "2026-03-01T00:00:00.000Z"
}
```

### Update Job

```
PATCH /api/v1/jobs/:id
Content-Type: application/json

{
  "cronExpression": "0 10 * * *",
  "enabled": false
}

Response: 200 OK
{
  "id": "job-456",
  "cronExpression": "0 10 * * *",
  "enabled": false,
  "nextRunAt": null
}
```

### Delete Job

```
DELETE /api/v1/jobs/:id

Response: 204 No Content
```

### Get Job Executions

```
GET /api/v1/jobs/:id/executions?limit=10

Response: 200 OK
[
  {
    "id": "exec-789",
    "jobId": "job-456",
    "runId": "run-101",
    "status": "completed",
    "scheduledAt": "2026-03-10T14:00:00.000Z",
    "executedAt": "2026-03-10T14:00:01.234Z"
  }
]
```

## Implementation Plan

### Phase 1: Storage Layer
1. Add `scheduled_jobs` and `job_executions` tables to storage schema
2. Implement `JobRepository` and `ExecutionRepository`
3. Add migration script

### Phase 2: Cron Engine
1. Integrate `cron-parser` library
2. Implement `getNextRunTime()` helper
3. Add cron expression validation

### Phase 3: Scheduler Service
1. Implement scheduler loop with tick-based evaluation
2. Add job execution logic
3. Implement failure handling and circuit breaker

### Phase 4: REST API
1. Add job routes to gateway
2. Implement CRUD operations
3. Add execution history endpoint

### Phase 5: Testing
1. Unit tests for cron evaluation
2. Integration tests for scheduler loop
3. End-to-end tests for full workflow
