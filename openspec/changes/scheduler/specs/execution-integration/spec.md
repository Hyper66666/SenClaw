# Execution Integration Specification

## Overview

Execution integration connects the scheduler to the agent service, submitting tasks when jobs are due and tracking execution results.

## Execution Flow

```
Scheduler Tick (every 10s)
       ↓
Find Due Jobs (next_run_at <= now)
       ↓
For Each Due Job:
  ↓
Check Concurrent Execution
  ↓
Submit Task to Agent Service
  ↓
Record Execution in Database
  ↓
Update Job (last_run_at, next_run_at)
  ↓
Handle Errors (retry, disable)
```

## Implementation

### Scheduler Loop

```typescript
export class Scheduler {
  private tickInterval = 10_000; // 10 seconds
  private timerId?: NodeJS.Timeout;

  constructor(
    private jobRepo: IJobRepository,
    private executionRepo: IExecutionRepository,
    private agentService: IAgentService
  ) {}

  async start(): Promise<void> {
    logger.info('Starting scheduler');

    // Initial tick
    await this.tick();

    // Schedule recurring ticks
    this.timerId = setInterval(() => this.tick(), this.tickInterval);
  }

  async stop(): Promise<void> {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = undefined;
    }
    logger.info('Scheduler stopped');
  }

  private async tick(): Promise<void> {
    try {
      const now = new Date();
      const dueJobs = await this.jobRepo.findDueJobs(now);

      logger.debug({ count: dueJobs.length }, 'Found due jobs');

      for (const job of dueJobs) {
        await this.executeJob(job, now);
      }
    } catch (error) {
      logger.error({ error }, 'Scheduler tick failed');
    }
  }

  private async executeJob(job: ScheduledJob, scheduledAt: Date): Promise<void> {
    const executionId = randomUUID();

    try {
      // Check concurrent execution
      if (!job.allowConcurrent) {
        const hasRunning = await this.executionRepo.hasRunningExecution(job.id);
        if (hasRunning) {
          logger.warn({ jobId: job.id }, 'Skipping job: previous execution still running');

          await this.executionRepo.create({
            id: executionId,
            jobId: job.id,
            runId: null,
            status: 'skipped',
            scheduledAt: scheduledAt.toISOString(),
            executedAt: new Date().toISOString(),
            error: 'Previous execution still running',
          });

          // Still update next run time
          await this.updateNextRunTime(job);
          return;
        }
      }

      // Submit task to agent
      logger.info({ jobId: job.id, agentId: job.agentId }, 'Submitting task');

      const run = await this.agentService.submitTask(job.agentId, job.input);

      // Record execution
      await this.executionRepo.create({
        id: executionId,
        jobId: job.id,
        runId: run.id,
        status: 'submitted',
        scheduledAt: scheduledAt.toISOString(),
        executedAt: new Date().toISOString(),
      });

      // Update job
      await this.updateNextRunTime(job);

      logger.info({
        jobId: job.id,
        executionId,
        runId: run.id,
      }, 'Job executed successfully');

    } catch (error) {
      logger.error({ error, jobId: job.id }, 'Job execution failed');

      // Record failure
      await this.executionRepo.create({
        id: executionId,
        jobId: job.id,
        runId: null,
        status: 'failed',
        scheduledAt: scheduledAt.toISOString(),
        executedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
      });

      // Handle failure (retry or disable)
      await this.handleFailure(job, error);
    }
  }

  private async updateNextRunTime(job: ScheduledJob): Promise<void> {
    const nextRun = getNextRunTime(job.cronExpression, job.timezone);

    await this.jobRepo.update(job.id, {
      lastRunAt: new Date().toISOString(),
      nextRunAt: nextRun.toISOString(),
    });
  }

  private async handleFailure(job: ScheduledJob, error: unknown): Promise<void> {
    const recentFailures = await this.executionRepo.countRecentFailures(job.id, 5);

    if (recentFailures >= 3) {
      // Disable job after 3 consecutive failures
      await this.jobRepo.update(job.id, { enabled: false });

      logger.error({
        jobId: job.id,
        failures: recentFailures,
      }, 'Job disabled due to repeated failures');
    } else {
      // Still update next run time for retry
      await this.updateNextRunTime(job);
    }
  }
}
```

## Agent Service Integration

### HTTP Client

```typescript
export interface IAgentService {
  submitTask(agentId: string, input: string): Promise<Run>;
}

export class HttpAgentService implements IAgentService {
  constructor(private gatewayUrl: string, private apiKey: string) {}

  async submitTask(agentId: string, input: string): Promise<Run> {
    const response = await fetch(`${this.gatewayUrl}/api/v1/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ agentId, input }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || `HTTP ${response.status}`);
    }

    return response.json();
  }
}
```

## Concurrent Execution Control

### Allow Concurrent

```typescript
const job: ScheduledJob = {
  // ...
  allowConcurrent: true, // Multiple executions can run simultaneously
};
```

**Use case**: Independent tasks (e.g., send notification)

### Disallow Concurrent (Default)

```typescript
const job: ScheduledJob = {
  // ...
  allowConcurrent: false, // Skip if previous execution still running
};
```

**Use case**: Stateful tasks (e.g., database backup, report generation)

## Failure Handling

### Circuit Breaker

Disable job after 3 consecutive failures:

```typescript
const recentFailures = await executionRepo.countRecentFailures(job.id, 5);

if (recentFailures >= 3) {
  await jobRepo.update(job.id, { enabled: false });
  logger.error({ jobId: job.id }, 'Job disabled due to repeated failures');
}
```

### Manual Re-enable

Admin must manually re-enable disabled jobs:

```
PATCH /api/v1/jobs/:id
{ "enabled": true }
```

## Monitoring

### Metrics

```typescript
import { Counter, Histogram } from 'prom-client';

const jobExecutionsTotal = new Counter({
  name: 'scheduler_job_executions_total',
  help: 'Total number of job executions',
  labelNames: ['job_id', 'status'],
});

const jobExecutionDuration = new Histogram({
  name: 'scheduler_job_execution_duration_seconds',
  help: 'Job execution duration',
  labelNames: ['job_id'],
});

// In executeJob()
const startTime = Date.now();

try {
  await this.agentService.submitTask(job.agentId, job.input);
  jobExecutionsTotal.inc({ job_id: job.id, status: 'success' });
} catch (error) {
  jobExecutionsTotal.inc({ job_id: job.id, status: 'failed' });
} finally {
  const duration = (Date.now() - startTime) / 1000;
  jobExecutionDuration.observe({ job_id: job.id }, duration);
}
```

### Logging

```typescript
logger.info({
  jobId: job.id,
  agentId: job.agentId,
  executionId,
  runId: run.id,
  scheduledAt: scheduledAt.toISOString(),
  executedAt: new Date().toISOString(),
}, 'Job executed');
```

## Error Scenarios

### Agent Not Found

```typescript
try {
  const run = await agentService.submitTask(job.agentId, job.input);
} catch (error) {
  if (error.message.includes('404')) {
    // Agent deleted, disable job
    await jobRepo.update(job.id, { enabled: false });
    logger.error({ jobId: job.id, agentId: job.agentId }, 'Agent not found, job disabled');
  }
}
```

### Network Error

```typescript
try {
  const run = await agentService.submitTask(job.agentId, job.input);
} catch (error) {
  if (error.code === 'ECONNREFUSED') {
    // Gateway down, retry on next tick
    logger.warn({ jobId: job.id }, 'Gateway unreachable, will retry');
    return; // Don't update next_run_at, will retry
  }
}
```

### Rate Limit

```typescript
try {
  const run = await agentService.submitTask(job.agentId, job.input);
} catch (error) {
  if (error.message.includes('429')) {
    // Rate limited, retry on next tick
    logger.warn({ jobId: job.id }, 'Rate limited, will retry');
    return;
  }
}
```

## Testing

```typescript
describe('Scheduler', () => {
  it('executes due job', async () => {
    const job = await createTestJob({
      cronExpression: '0 9 * * *',
      nextRunAt: new Date('2026-03-10T09:00:00Z').toISOString(),
    });

    const agentService = {
      submitTask: vi.fn().mockResolvedValue({ id: 'run-123' }),
    };

    const scheduler = new Scheduler(jobRepo, executionRepo, agentService);

    // Simulate tick at 9:05 AM
    await scheduler.tick(new Date('2026-03-10T09:05:00Z'));

    expect(agentService.submitTask).toHaveBeenCalledWith(job.agentId, job.input);

    const executions = await executionRepo.listByJobId(job.id);
    expect(executions).toHaveLength(1);
    expect(executions[0].status).toBe('submitted');
  });

  it('skips job if previous execution running', async () => {
    const job = await createTestJob({
      allowConcurrent: false,
      nextRunAt: new Date('2026-03-10T09:00:00Z').toISOString(),
    });

    const run = await createTestRun({ status: 'running' });

    await executionRepo.create({
      id: 'exec-1',
      jobId: job.id,
      runId: run.id,
      status: 'submitted',
      scheduledAt: new Date().toISOString(),
      executedAt: new Date().toISOString(),
    });

    const agentService = {
      submitTask: vi.fn(),
    };

    const scheduler = new Scheduler(jobRepo, executionRepo, agentService);
    await scheduler.tick(new Date('2026-03-10T09:05:00Z'));

    expect(agentService.submitTask).not.toHaveBeenCalled();

    const executions = await executionRepo.listByJobId(job.id);
    expect(executions[1].status).toBe('skipped');
  });

  it('disables job after 3 failures', async () => {
    const job = await createTestJob({
      nextRunAt: new Date('2026-03-10T09:00:00Z').toISOString(),
    });

    // Create 2 previous failures
    for (let i = 0; i < 2; i++) {
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

    const agentService = {
      submitTask: vi.fn().mockRejectedValue(new Error('Test error')),
    };

    const scheduler = new Scheduler(jobRepo, executionRepo, agentService);
    await scheduler.tick(new Date('2026-03-10T09:05:00Z'));

    const updated = await jobRepo.get(job.id);
    expect(updated?.enabled).toBe(false);
  });
});
```

## Configuration

```bash
# Scheduler tick interval (ms)
SENCLAW_SCHEDULER_TICK_INTERVAL=10000

# Gateway URL for task submission
SENCLAW_GATEWAY_URL=http://localhost:4100

# API key for scheduler (should be admin role)
SENCLAW_SCHEDULER_API_KEY=sk_scheduler_key
```

## Best Practices

1. **Use admin API key** for scheduler (unrestricted access)
2. **Set reasonable tick interval** (10s default, don't go below 5s)
3. **Monitor failure rate** and investigate disabled jobs
4. **Test concurrent execution** behavior for each job type
5. **Handle network errors** gracefully (retry on next tick)
6. **Log all executions** for audit trail
7. **Use metrics** to track job health
8. **Set up alerts** for disabled jobs
