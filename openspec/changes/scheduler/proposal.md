# Scheduler

## Problem Statement

Senclaw currently supports only on-demand task execution triggered by API calls. Users cannot:

- Schedule recurring agent tasks (e.g., daily reports, hourly data sync)
- Execute tasks at specific times (e.g., "run this agent every Monday at 9 AM")
- Implement time-based workflows (e.g., "check status every 5 minutes until complete")
- Build autonomous agents that operate on a schedule without manual intervention

This limits Senclaw's usefulness for:
- **Monitoring and alerting**: Periodic health checks, log analysis
- **Data pipelines**: Scheduled ETL jobs, report generation
- **Automation**: Recurring maintenance tasks, batch processing
- **Proactive agents**: Agents that initiate work based on time triggers

## Proposed Solution

Implement a scheduler service that manages time-based task execution using cron expressions. The scheduler will:

1. **Store scheduled jobs** in the persistent storage layer (SQLite)
2. **Evaluate cron expressions** to determine when jobs should run
3. **Submit tasks** to agents via the existing `AgentService` API
4. **Track execution history** for monitoring and debugging
5. **Handle failures** with configurable retry policies

### Core Capabilities

1. **Job Management**
   - Create scheduled jobs with cron expressions
   - Update job schedules and configurations
   - Enable/disable jobs without deletion
   - Delete jobs permanently
   - List all jobs with filtering (active, paused, failed)

2. **Cron Expression Support**
   - Standard 5-field cron syntax: `minute hour day month weekday`
   - Special expressions: `@hourly`, `@daily`, `@weekly`, `@monthly`
   - Timezone support (default: UTC, configurable per job)

3. **Execution Management**
   - Automatic task submission at scheduled times
   - Execution history tracking (last run, next run, status)
   - Concurrent execution control (allow/prevent overlapping runs)
   - Timeout handling for long-running jobs

4. **Failure Handling**
   - Configurable retry policy (max retries, backoff strategy)
   - Error logging and alerting
   - Automatic job disabling after repeated failures (circuit breaker)

5. **Observability**
   - Health check endpoint (scheduler status, pending jobs count)
   - Metrics: jobs executed, failures, execution duration
   - Audit log: job creation, updates, deletions, executions

### Technology Stack

- **Cron Parser**: `cron-parser` (battle-tested, supports timezones)
- **Job Storage**: SQLite via Drizzle ORM (reuse `@senclaw/storage`)
- **Scheduler Loop**: Node.js `setInterval` with tick-based evaluation
- **Execution**: Delegate to `AgentService.submitTask()`

### Architecture Principles

- **Stateless Scheduler**: All state in database, scheduler can restart without losing jobs
- **Single-Instance**: No distributed coordination (future enhancement)
- **Fail-Safe**: Missed executions logged but not retried (avoid cascading failures)
- **Idempotent**: Jobs can be safely re-evaluated without duplicate execution

## Success Criteria

1. **Functional Completeness**: Create, read, update, delete, enable/disable scheduled jobs
2. **Accuracy**: Jobs execute within 1 second of scheduled time (under normal load)
3. **Reliability**: Scheduler survives restarts, no lost jobs
4. **Performance**: Handle 1000+ jobs with < 100ms evaluation overhead per tick
5. **Observability**: Execution history queryable via API, metrics exposed

## Non-Goals

- **Distributed Scheduling**: Single-instance only (no leader election, no sharding)
- **Complex Dependencies**: No job chaining or DAG workflows (use agent logic instead)
- **Dynamic Cron**: No runtime cron expression modification based on results
- **Historical Backfill**: Missed executions are logged but not automatically retried

## Dependencies

- **Prerequisite**: `persistent-storage` change set (for job and execution history storage)
- **Prerequisite**: `AgentService` API (for task submission)
- **Optional**: `observability` enhancement (for metrics and tracing)

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Clock drift causes missed executions | High | Use NTP-synced system clock, log drift warnings |
| Long-running jobs block scheduler | Medium | Run task submission asynchronously, add timeout |
| Database lock contention under load | Medium | Use WAL mode (already enabled), batch updates |
| Cron expression parsing errors | Low | Validate expressions on job creation, reject invalid |
| Timezone handling complexity | Medium | Store all times in UTC, convert for display only |

## Timeline Estimate

- **Phase 1** (Job Storage Schema + CRUD API): 1-2 days
- **Phase 2** (Cron Evaluation Engine): 1-2 days
- **Phase 3** (Scheduler Loop + Execution): 1-2 days
- **Phase 4** (Failure Handling + Observability): 1-2 days
- **Phase 5** (Testing + Documentation): 1-2 days

**Total**: 5-10 days for a single developer

## Open Questions

1. Should the scheduler run as a separate process or in-process with the gateway?
   - **Recommendation**: Separate process (`apps/scheduler`) for isolation, can be deployed independently

2. What happens if a job's scheduled time is missed (e.g., scheduler was down)?
   - **Recommendation**: Log as "missed", do not execute retroactively (avoid thundering herd)

3. Should jobs support parameters (e.g., different input per execution)?
   - **Recommendation**: No for v1, jobs have static input; use agent logic for dynamic behavior

4. How to handle jobs that take longer than their interval (e.g., hourly job takes 2 hours)?
   - **Recommendation**: Add `allowConcurrent` flag (default: false), skip execution if previous still running

5. Should we support one-time scheduled tasks (run once at specific time)?
   - **Recommendation**: Yes, use special cron expression or `runOnce` flag, auto-disable after execution

6. How to expose scheduler API (REST, gRPC, internal only)?
   - **Recommendation**: REST API via gateway (`/api/v1/jobs`), scheduler polls database for changes
