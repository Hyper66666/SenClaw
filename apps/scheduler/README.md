# Scheduler App

The scheduler is a standalone Senclaw process that watches persisted jobs, submits due work to the gateway, and records execution history in SQLite.

Supported platforms in the current roadmap:

- Windows
- Linux

## Responsibilities

- Evaluate cron schedules with timezone support
- Submit due jobs to `POST /api/v1/tasks`
- Prevent overlapping executions when `allowConcurrent=false`
- Disable jobs after three consecutive task submission failures
- Expose process health from `GET /health`

## Runtime Topology

The scheduler is not a second gateway. It is a worker process that shares the same database as the gateway. Manual end-to-end verification should always target this standalone process, not any in-process gateway loop.

```text
scheduler app
  -> reads jobs / executions from SQLite
  -> calls gateway /api/v1/tasks with a bearer API key
  -> updates job history back into SQLite
```

## Quick Start

### 1. Configure the shared database

```bash
export SENCLAW_DB_URL=file:./senclaw.db
```

Windows PowerShell:

```powershell
$env:SENCLAW_DB_URL = 'file:./senclaw.db'
```

### 2. Configure gateway access

Use either a dedicated scheduler key or the generic API key env var.

```bash
export SENCLAW_GATEWAY_URL=http://127.0.0.1:4100
export SENCLAW_SCHEDULER_API_KEY=sk_your_scheduler_key
```

### 3. Start the gateway

```bash
pnpm --filter @senclaw/gateway dev
```

### 4. Start the scheduler

```bash
pnpm --filter @senclaw/scheduler-app dev
```

### 5. Check health

```bash
curl http://127.0.0.1:4500/health
```

Example response:

```json
{
  "status": "healthy",
  "pendingJobs": 0
}
```

## Scripts

- `pnpm --filter @senclaw/scheduler-app dev`
- `pnpm --filter @senclaw/scheduler-app build`
- `pnpm --filter @senclaw/scheduler-app start`

## Configuration

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `SENCLAW_DB_URL` | yes | none | Shared SQLite database used by gateway and scheduler |
| `SENCLAW_GATEWAY_URL` | no | `http://127.0.0.1:${SENCLAW_GATEWAY_PORT}` | Explicit gateway base URL |
| `SENCLAW_GATEWAY_PORT` | no | `4100` | Fallback port when `SENCLAW_GATEWAY_URL` is unset |
| `SENCLAW_SCHEDULER_API_KEY` | yes unless `SENCLAW_API_KEY` is set | none | Bearer token used for task submission |
| `SENCLAW_API_KEY` | fallback | none | Generic API key fallback |
| `SENCLAW_SCHEDULER_PORT` | no | `4500` | Scheduler HTTP port |
| `SENCLAW_SCHEDULER_TICK_INTERVAL_MS` | no | `10000` | Poll interval for due jobs; minimum `1000` |
| `SENCLAW_LOG_LEVEL` | no | `info` | Scheduler log level |

## Storage Invariants

- `scheduled_jobs.agent_id` cascades when an agent is deleted
- `job_executions.job_id` cascades when a job is deleted
- `job_executions.run_id` is set to `null` if the linked run is removed
- persisted timestamps are stored as UTC ISO strings

## Cron Support

The scheduler accepts standard 5-field cron expressions plus these aliases:

- `@hourly`
- `@daily`
- `@weekly`
- `@monthly`
- `@yearly`

Examples:

- `*/5 * * * *` - every 5 minutes
- `0 9 * * *` - daily at 09:00 in the job timezone
- `0 0 * * 1` - every Monday at midnight
- `@daily` - once per day

## Failure and Concurrency Behavior

### Concurrent execution control

When `allowConcurrent=false`, the scheduler checks for an existing `submitted` execution whose run is still `pending` or `running`.

If one exists:

- no new task is submitted
- a `skipped` execution record is written
- the skip reason is recorded as `Previous execution still running`

### Circuit breaker

The scheduler disables a job after three consecutive task submission failures in the recent execution window.

Typical submission failures include:

- revoked or missing scheduler API key
- gateway returning `401`, `403`, `404`, or `5xx`
- network errors between scheduler and gateway

This circuit breaker is about submission failures. It does not inspect downstream agent model failures after a run has already been created.

## Deployment Notes

### Windows

- Run from PowerShell.
- If you use SQLite persistence locally, follow the repository bootstrap notes for `better-sqlite3` prerequisites.
- Use a Windows service wrapper only if your environment already standardizes one; the repo does not ship one yet.

### Linux

A minimal systemd unit can look like this:

```ini
[Unit]
Description=Senclaw Scheduler
After=network.target

[Service]
WorkingDirectory=/opt/senclaw
Environment=SENCLAW_DB_URL=file:/opt/senclaw/senclaw.db
Environment=SENCLAW_GATEWAY_URL=http://127.0.0.1:4100
Environment=SENCLAW_SCHEDULER_API_KEY=sk_replace_me
ExecStart=/usr/bin/pnpm --filter @senclaw/scheduler-app start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

## Example Jobs

### Daily report

```json
{
  "name": "Daily report",
  "cronExpression": "0 9 * * *",
  "timezone": "UTC",
  "input": "Generate the daily operations report"
}
```

### Hourly health check

```json
{
  "name": "Hourly health check",
  "cronExpression": "@hourly",
  "timezone": "UTC",
  "input": "Check system health and summarize anomalies"
}
```

### Weekly cleanup

```json
{
  "name": "Weekly cleanup",
  "cronExpression": "0 3 * * 0",
  "timezone": "UTC",
  "input": "Review stale runs and prepare cleanup actions"
}
```