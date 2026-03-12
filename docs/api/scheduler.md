# Scheduler API

The scheduler feature is split across two surfaces:

- Gateway job management endpoints under `/api/v1/jobs`
- Scheduler process health endpoint at `GET /health` on the scheduler app itself

Manual end-to-end verification should always target the standalone `apps/scheduler` process. The gateway exposes job management APIs, but it is not the scheduler runtime.

## Authentication

All gateway job routes require a bearer API key with read or write access.

```bash
-H "Authorization: Bearer sk_your_key"
```

## Create Job

```http
POST /api/v1/jobs
```

Request body:

```json
{
  "agentId": "7af7d3c1-8d0d-4af1-b4a5-fb4d8d7d40e0",
  "name": "Daily Report",
  "cronExpression": "0 9 * * *",
  "input": "Generate daily report",
  "allowConcurrent": false,
  "timezone": "America/New_York",
  "maxRetries": 3
}
```

Successful response:

```json
{
  "id": "1d5a3bdf-c96d-4f51-a766-0e2c9cc8a1d2",
  "agentId": "7af7d3c1-8d0d-4af1-b4a5-fb4d8d7d40e0",
  "name": "Daily Report",
  "cronExpression": "0 9 * * *",
  "input": "Generate daily report",
  "enabled": true,
  "allowConcurrent": false,
  "timezone": "America/New_York",
  "maxRetries": 3,
  "createdAt": "2026-03-11T00:00:00.000Z",
  "updatedAt": "2026-03-11T00:00:00.000Z",
  "nextRunAt": "2026-03-11T13:00:00.000Z"
}
```

Validation rules:

- `cronExpression` must parse successfully
- `timezone` must be a valid IANA timezone
- `agentId` must refer to an existing agent

## List Jobs

```http
GET /api/v1/jobs?agentId=<id>&enabled=true
```

Filter parameters:

- `agentId`
- `enabled`

Response:

```json
[
  {
    "id": "job-1",
    "name": "Daily Report",
    "enabled": true,
    "cronExpression": "0 9 * * *",
    "timezone": "UTC"
  }
]
```

## Get Job

```http
GET /api/v1/jobs/:id
```

Returns `404` when the job does not exist.

## Update Job

```http
PATCH /api/v1/jobs/:id
```

Example request:

```json
{
  "cronExpression": "30 10 * * *",
  "enabled": true,
  "timezone": "UTC"
}
```

Behavior:

- only supplied fields are updated
- changing `cronExpression` or `timezone` recalculates `nextRunAt`

## Delete Job

```http
DELETE /api/v1/jobs/:id
```

Response:

- `204 No Content` on success
- `404` when the job does not exist

Deleting a job cascades to its execution history in SQLite.

## Storage Constraints

- `scheduled_jobs.agent_id` references `agents.id` with cascade delete
- `job_executions.job_id` references `scheduled_jobs.id` with cascade delete
- `job_executions.run_id` references `runs.id` with `SET NULL` on delete
- persisted scheduler timestamps are stored in UTC and converted for timezone-aware cron evaluation only at scheduling time

## List Job Executions

```http
GET /api/v1/jobs/:id/executions?limit=50&offset=0
```

Example response:

```json
[
  {
    "id": "exec-1",
    "jobId": "job-1",
    "runId": "run-1",
    "status": "submitted",
    "scheduledAt": "2026-03-11T09:00:00.000Z",
    "executedAt": "2026-03-11T09:00:00.000Z"
  },
  {
    "id": "exec-2",
    "jobId": "job-1",
    "status": "skipped",
    "scheduledAt": "2026-03-11T09:05:00.000Z",
    "executedAt": "2026-03-11T09:05:00.000Z",
    "error": "Previous execution still running"
  }
]
```

Execution statuses currently used by the scheduler:

- `submitted`
- `skipped`
- `failed`

## Scheduler Health Endpoint

The standalone scheduler app exposes its own health endpoint.

```http
GET http://127.0.0.1:4500/health
```

Response:

```json
{
  "status": "healthy",
  "pendingJobs": 0
}
```

`status` becomes `unhealthy` if the scheduler cannot talk to storage.

## Cron Syntax

### Standard 5-field format

```text
minute hour day-of-month month day-of-week
```

Examples:

- `* * * * *` - every minute
- `*/5 * * * *` - every 5 minutes
- `0 * * * *` - every hour
- `0 9 * * 1-5` - weekdays at 09:00
- `0 0 1 * *` - first day of each month at midnight

### Special expressions

The current implementation also accepts:

- `@hourly`
- `@daily`
- `@weekly`
- `@monthly`
- `@yearly`

## Timezone Handling

Jobs store timestamps in UTC, while schedule evaluation honors the job timezone.

Recommended pattern:

- set `timezone` explicitly on every job
- keep API consumers displaying `nextRunAt` in the operator's preferred timezone

Examples:

- `UTC`
- `America/New_York`
- `Europe/London`
- `Asia/Tokyo`

## Failure Handling

### Submission failures

If the scheduler cannot create a task through the gateway, it records a `failed` execution with an error message.

Examples:

- scheduler API key revoked
- gateway unavailable
- agent no longer resolvable through the submission path

### Circuit breaker

After three consecutive submission failures in the recent execution window, the scheduler disables the job by setting `enabled=false`.

### Overlap prevention

If `allowConcurrent=false` and a prior execution is still tied to a `pending` or `running` run:

- the scheduler does not submit a new run
- a `skipped` execution is recorded instead

## Example Workflows

### Daily report

```bash
curl -X POST http://127.0.0.1:4100/api/v1/jobs \
  -H "Authorization: Bearer sk_admin_key" \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "agent-daily",
    "name": "Daily report",
    "cronExpression": "0 9 * * *",
    "timezone": "UTC",
    "input": "Generate the daily operations report"
  }'
```

### Hourly health check

```bash
curl -X POST http://127.0.0.1:4100/api/v1/jobs \
  -H "Authorization: Bearer sk_admin_key" \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "agent-health",
    "name": "Hourly health check",
    "cronExpression": "@hourly",
    "timezone": "UTC",
    "input": "Summarize system health and anomalies"
  }'
```

### Weekly cleanup

```bash
curl -X POST http://127.0.0.1:4100/api/v1/jobs \
  -H "Authorization: Bearer sk_admin_key" \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "agent-cleanup",
    "name": "Weekly cleanup",
    "cronExpression": "0 3 * * 0",
    "timezone": "UTC",
    "input": "Review stale runs and cleanup candidates"
  }'
```