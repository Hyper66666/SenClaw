> Alignment note: scheduler core landed in `packages/scheduler` and `packages/storage`, while `apps/scheduler` remains the standalone runtime. Tasks below are checked when the behavior exists in current code/tests even if the original scaffold path differs.

## 1. Storage Schema

- [x] 1.1 Add `scheduled_jobs` table to `packages/storage/src/schema.ts`: columns `id`, `agent_id`, `name`, `cron_expression`, `input`, `enabled`, `allow_concurrent`, `timezone`, `max_retries`, `created_at`, `updated_at`, `last_run_at`, `next_run_at`.
- [x] 1.2 Add `job_executions` table: columns `id`, `job_id`, `run_id`, `status`, `scheduled_at`, `executed_at`, `error`.
- [x] 1.3 Add foreign key constraint: `scheduled_jobs.agent_id` -> `agents.id` (CASCADE).
- [x] 1.4 Add foreign key constraint: `job_executions.job_id` -> `scheduled_jobs.id` (CASCADE).
- [x] 1.5 Add foreign key constraint: `job_executions.run_id` -> `runs.id` (SET NULL).
- [x] 1.6 Add indexes: `job_executions(job_id)`, `job_executions(scheduled_at)`.
- [x] 1.7 Run `pnpm db:generate` to create migration file.
- [x] 1.8 Commit migration file.

## 2. Repository Implementations

- [x] 2.1 Define `IJobRepository` interface in `@senclaw/protocol`: `create()`, `get()`, `list()`, `update()`, `delete()`, `findDueJobs(now)`.
- [x] 2.2 Define `IExecutionRepository` interface: `create()`, `listByJobId()`, `hasRunningExecution()`, `countRecentFailures()`.
- [x] 2.3 Implement `SqliteJobRepository` in `packages/storage/src/job-repository.ts`.
- [x] 2.4 Implement `SqliteExecutionRepository` in `packages/storage/src/execution-repository.ts`.
- [x] 2.5 Update `createStorage()` to return `jobs` and `executions` repositories.
- [x] 2.6 Export repository interfaces from `@senclaw/protocol`.
- [x] 2.7 Add unit tests for job repository (create, get, list, update, delete, findDueJobs).
- [x] 2.8 Add unit tests for execution repository (create, listByJobId, hasRunningExecution, countRecentFailures).

## 3. Cron Engine

- [x] 3.1 Add `cron-parser` as dependency to `apps/scheduler`.
- [x] 3.2 Implement `getNextRunTime(cronExpression, timezone)` helper function.
- [x] 3.3 Implement `validateCronExpression(expression)` helper function.
- [x] 3.4 Add support for special expressions: `@hourly`, `@daily`, `@weekly`, `@monthly`, `@yearly`.
- [x] 3.5 Add unit tests for cron parsing (valid expressions, invalid expressions, special expressions, timezone handling).

## 4. Scheduler Service

- [x] 4.1 Create `apps/scheduler/src/scheduler.ts` with `Scheduler` class.
- [x] 4.2 Implement `start()` method: initialize interval timer with configurable tick rate (default 10s).
- [x] 4.3 Implement `stop()` method: clear interval timer, graceful shutdown.
- [x] 4.4 Implement `tick()` method: query due jobs, execute each job.
- [x] 4.5 Implement `executeJob(job, scheduledAt)` method: check concurrent execution, submit task, record execution, update job times.
- [x] 4.6 Implement `handleFailure(job, error)` method: count recent failures, disable job after 3 consecutive failures.
- [x] 4.7 Add configuration: `SENCLAW_SCHEDULER_TICK_INTERVAL_MS` (default 10000).
- [x] 4.8 Integrate with `AgentService` for task submission (HTTP client to gateway API).
- [x] 4.9 Add structured logging for all scheduler events (job executed, skipped, failed, disabled).
- [x] 4.10 Add unit tests for scheduler logic (mock repositories, mock agent service).

## 5. Gateway API Routes

- [x] 5.1 Add `ScheduledJobSchema` and `CreateScheduledJobSchema` to `@senclaw/protocol`.
- [x] 5.2 Implement `POST /api/v1/jobs` route: validate input, create job, calculate next run time, return job.
- [x] 5.3 Implement `GET /api/v1/jobs` route: list jobs with optional filters (enabled, agentId).
- [x] 5.4 Implement `GET /api/v1/jobs/:id` route: get job by ID, return 404 if not found.
- [x] 5.5 Implement `PATCH /api/v1/jobs/:id` route: update job fields (cronExpression, enabled, input), recalculate next run time.
- [x] 5.6 Implement `DELETE /api/v1/jobs/:id` route: delete job and all executions (CASCADE).
- [x] 5.7 Implement `GET /api/v1/jobs/:id/executions` route: list executions for job with pagination (limit, offset).
- [x] 5.8 Add validation: cron expression must be valid, agent must exist, timezone must be valid.
- [x] 5.9 Add error handling: 400 for validation errors, 404 for not found, 500 for server errors.
- [x] 5.10 Add unit tests for all routes (mock repositories).

## 6. Scheduler Process

- [x] 6.1 Create `apps/scheduler/src/index.ts` as entry point.
- [x] 6.2 Load config with `loadConfig()`.
- [x] 6.3 Initialize storage with `createStorage(config.dbUrl)`.
- [x] 6.4 Create HTTP client for gateway API (for task submission).
- [x] 6.5 Instantiate `Scheduler` with repositories and agent service client.
- [x] 6.6 Start scheduler with `scheduler.start()`.
- [x] 6.7 Add graceful shutdown handler (SIGINT, SIGTERM): call `scheduler.stop()`, close database.
- [x] 6.8 Add health check endpoint: `GET /health` returns scheduler status and pending jobs count.
- [x] 6.9 Update `package.json` scripts: `dev`, `build`, `start`.
- [x] 6.10 Add `apps/scheduler` to workspace references in `tsconfig.workspace.json`.

## 7. Concurrent Execution Control

- [x] 7.1 Implement `hasRunningExecution(jobId)` in execution repository: check if any execution has status 'submitted' and corresponding run has status 'pending' or 'running'.
- [x] 7.2 In `executeJob()`, check `job.allowConcurrent` flag before submitting task.
- [x] 7.3 If concurrent execution not allowed and previous execution still running, create execution record with status 'skipped'.
- [x] 7.4 Add unit tests for concurrent execution control (allow, disallow, skip).

## 8. Failure Handling

- [x] 8.1 Implement `countRecentFailures(jobId, limit)` in execution repository: count executions with status 'failed' in last N executions.
- [x] 8.2 In `handleFailure()`, query recent failures count.
- [x] 8.3 If failures >= 3, disable job by setting `enabled = false`.
- [x] 8.4 Log warning when job is disabled due to repeated failures.
- [x] 8.5 Add unit tests for failure handling (1 failure, 3 failures, job disabled).

## 9. Timezone Support

- [x] 9.1 Store all timestamps in UTC in database.
- [x] 9.2 Use `cron-parser` with `tz` option for timezone-aware cron evaluation.
- [x] 9.3 Validate timezone on job creation (use `Intl.supportedValuesOf('timeZone')` or similar).
- [x] 9.4 Add unit tests for timezone handling (UTC, America/New_York, Europe/London, Asia/Tokyo).

## 10. Observability

- [x] 10.1 Add metrics: `scheduler_jobs_executed_total`, `scheduler_jobs_failed_total`, `scheduler_jobs_skipped_total`.
- [x] 10.2 Add metrics: `scheduler_execution_duration_seconds` (histogram).
- [x] 10.3 Add health check: return `{ status: 'healthy', pendingJobs: count }`.
- [x] 10.4 Add structured logging: log every job execution with jobId, runId, status, duration.
- [x] 10.5 Integrate with `@senclaw/observability` for metrics collection.

## 11. Integration Tests

- [x] 11.1 Add integration test: create job, wait for execution, verify run created.
- [x] 11.2 Add integration test: create job with `allowConcurrent: false`, verify second execution skipped if first still running.
- [x] 11.3 Add integration test: create job, simulate 3 failures, verify job disabled.
- [x] 11.4 Add integration test: create job with timezone, verify next run time calculated correctly.
- [x] 11.5 Add integration test: update job cron expression, verify next run time recalculated.
- [x] 11.6 Add integration test: delete job, verify executions also deleted (CASCADE).

## 12. Documentation

- [x] 12.1 Add README.md to `apps/scheduler` with setup instructions, configuration, deployment.
- [x] 12.2 Document cron expression syntax and special expressions.
- [x] 12.3 Document API endpoints with request/response examples.
- [x] 12.4 Document failure handling and circuit breaker behavior.
- [x] 12.5 Add examples: daily report, hourly health check, weekly cleanup.

## 13. Verification

- [ ] 13.1 Run `pnpm run verify` and ensure all checks pass.
- [x] 13.2 Run `pnpm run test` and ensure all unit tests pass.
- [x] 13.3 Run `pnpm run test:integration` and ensure integration tests pass.
- [x] 13.4 Start scheduler with `pnpm --filter @senclaw/scheduler-app dev`.
- [x] 13.5 Create a test job via API: `POST /api/v1/jobs`.
- [x] 13.6 Verify job executes at scheduled time (check logs, query executions).
- [x] 13.7 Verify job disabled after 3 consecutive failures.
- [x] 13.8 Verify concurrent execution control works (skip if previous running).
- [x] 13.9 Verify timezone handling (create job with non-UTC timezone).
- [x] 13.10 Verify scheduler survives restart (stop, start, verify jobs still scheduled).








