# Senclaw

Senclaw is an AI agent orchestration platform with persistent storage, API-key authentication, a web console, connector ingestion, scheduling, and sandboxed tool execution.

The codebase is feature-rich, but release readiness still depends on repository-wide verification. As of March 12, 2026, the latest local Windows verification shows `build`, `test`, and `test:integration` passing, while `verify` is still blocked by repository-wide Biome formatting drift.

## Readiness Snapshot

Latest local evidence on March 12, 2026 (Windows):

- `pnpm run build`: pass
- `pnpm run test`: pass (`28` test files, `195` tests)
- `pnpm run test:integration`: pass (`6` test files, `20` tests)
- `pnpm run verify`: fail (`42` Biome formatting errors across existing repository files)

Supported development platforms:

- Windows
- Linux

See [PRODUCTION_READINESS.md](./PRODUCTION_READINESS.md) for the current blocker list and subsystem-by-subsystem status.

## Repository Layout

Applications:

- `@senclaw/gateway`: Fastify API and management surface
- `@senclaw/agent-runner`: agent execution runtime
- `@senclaw/tool-runner-host`: sandboxed tool host
- `@senclaw/scheduler-app`: standalone scheduler process
- `@senclaw/connector-worker-app`: connector lifecycle host
- `@senclaw/web`: React web console

Packages:

- `@senclaw/protocol`: shared schemas and types
- `@senclaw/config`: environment and config helpers
- `@senclaw/storage`: SQLite repositories and migrations
- `@senclaw/logging`: structured logging
- `@senclaw/observability`: metrics and tracing
- `@senclaw/scheduler`: scheduler service library
- `@senclaw/connector-worker`: connector worker library
- `@senclaw/cli`: CLI client

## Prerequisites

- Node.js `>=22.0.0`
- pnpm `>=10.0.0`
- SQLite-compatible filesystem access for `SENCLAW_DB_URL`
- Optional: Rust toolchain for native sandbox validation (`native/sandbox-runner`)

This machine currently uses Node `v20.11.0`, so commands succeed with engine warnings. Use Node 22+ for supported local and CI verification.

## Quick Start

```bash
# Clone the repository
git clone https://github.com/Hyper66666/SenClaw.git
cd SenClaw

# Install dependencies
corepack pnpm install

# Configure the environment
copy .env.example .env
# or on Linux: cp .env.example .env

# Build the workspace
corepack pnpm run build
```

Start the core services in separate terminals:

```bash
corepack pnpm --filter @senclaw/gateway dev
corepack pnpm --filter @senclaw/agent-runner dev
corepack pnpm --filter @senclaw/tool-runner-host dev
```

Optional processes:

```bash
corepack pnpm --filter @senclaw/scheduler-app dev
corepack pnpm --filter @senclaw/connector-worker-app dev
corepack pnpm --filter @senclaw/web dev
```

Notes:

- Root `pnpm run dev` only starts `@senclaw/gateway`.
- The web console dev server runs on `http://localhost:3000` by default.
- The gateway API runs on `http://localhost:4100` by default.
- The standalone scheduler health endpoint runs on `http://localhost:4500/health` by default.

## Authentication

Gateway API routes under `/api/v1/*` require a bearer API key by default.

Create or bootstrap a key:

```bash
corepack pnpm run auth:bootstrap-admin
```

The web console now supports a lightweight API-key session. Paste a bearer token into the header form before using protected views such as agents, runs, or task submission.

## Verification Commands

```bash
corepack pnpm run build
corepack pnpm run test
corepack pnpm run test:integration
corepack pnpm run verify
```

Current release claims must be based on all four commands, not just the test suites.

## Key Docs

- [Production readiness](./PRODUCTION_READINESS.md)
- [Web console](./apps/web/README.md)
- [Scheduler API](./docs/api/scheduler.md)
- [Connector worker](./docs/api/connectors.md)
- [Tool sandbox](./docs/api/tool-sandbox.md)

## Current Gaps

These areas are implemented but not fully release-closed yet:

- repository-wide `verify` cleanup
- OpenSpec task-state drift in several older changes
- broker-specific queue drivers for RabbitMQ and Redis
- evidence-backed Rust sandbox validation on both Windows and Linux

## Repository URL

- Source: https://github.com/Hyper66666/SenClaw
- Issues: https://github.com/Hyper66666/SenClaw/issues


