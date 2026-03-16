# Senclaw

[English](./README.md) | [简体中文](./README.zh-CN.md)

Senclaw is an AI agent orchestration platform with persistent storage, API-key authentication, a web console, connector ingestion, scheduling, and sandboxed tool execution.

The codebase is feature-rich and the repository gate is now green locally. As of March 16, 2026, the Windows baseline go-live gate has been closed with recorded Node 22 verification and browser-level protected web-console acceptance. RabbitMQ and Redis Streams queue drivers are implemented in-tree with unit coverage and default gateway wiring, but live-broker release evidence is still pending.

## Readiness Snapshot

Latest local evidence on March 16, 2026 (Windows baseline recorded on portable Node `v22.22.1`):

- `pnpm run build`: pass
- `pnpm run test`: pass (`46` test files, `267` tests)
- `pnpm run test:integration`: pass (`6` test files, `20` tests) plus an opt-in live-broker suite (`1` file, `4` skipped without broker env)
- `pnpm run verify`: pass

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

This machine still uses Node `v20.11.0` as the default local install, so commands succeed with engine warnings unless a Node 22 runtime is selected. The supported-runtime gate has now been revalidated locally with portable Node `v22.22.1`.

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

## One-Click Local Runtime

For a local all-in-one SenClaw session, use the launcher scripts:

```bash
# Windows
scripts\\start-senclaw.cmd
scripts\\stop-senclaw.cmd

# Linux
./scripts/start-senclaw.sh
./scripts/stop-senclaw.sh
```

The launcher bootstraps the local runtime under `.tmp/live-run`, starts the gateway and web console, reuses a persistent bootstrap admin key, and prints a startup banner with:

- current model ID
- admin key
- web console URL
- gateway URL
- runtime log directory

The web console header includes an `EN / 中文` locale toggle. The selected language is persisted and applied in two places:

- immediately for web console copy via browser storage
- on the next launcher start via `.tmp/live-run/runtime-settings.json`

If you are already in the repository root on Windows `cmd`, you can use the shorter wrapper command directly:

```bat
senclaw start
senclaw stop
```

This wrapper forwards to the local CLI in `packages/cli` and behaves like the launcher scripts.

## Authentication

Gateway API routes under `/api/v1/*` require a bearer API key by default.

Create or bootstrap a key:

```bash
corepack pnpm run auth:bootstrap-admin
```

The web console now supports a lightweight API-key session. Paste a bearer token into the header form before using protected views such as agents, runs, or task submission.

## Real Provider Smoke Test

Senclaw includes a smoke path for OpenAI-compatible providers that does not store secrets in the repository. Set these environment variables locally:

```bash
SENCLAW_OPENAI_API_KEY=<your key>
SENCLAW_OPENAI_BASE_URL=<compatible base url>
SENCLAW_OPENAI_MODEL=<model id>
# optional
SENCLAW_SMOKE_PROMPT=Reply with the single word OK.
SENCLAW_SMOKE_TIMEOUT_MS=60000
```

Then run:

```bash
corepack pnpm run test:provider-smoke
```

The script exercises the existing gateway and agent runtime, creates a temporary agent with `provider: openai`, submits a task, waits for completion, and prints the assistant response or a diagnosable provider error. On March 12, 2026, this smoke path was validated against the Volcengine Ark OpenAI-compatible endpoint with model `doubao-seed-2.0-pro`, returning `OK`.

## Verification Commands

```bash
corepack pnpm run build
corepack pnpm run test
corepack pnpm run test:integration
corepack pnpm run verify
```

Current release claims must be based on all four commands. The Windows baseline sign-off is now recorded; the remaining release work is limited to optional broker-backed queue validation and Linux native sandbox validation.

## Key Docs

- [Production readiness](./PRODUCTION_READINESS.md)
- [Web console](./apps/web/README.md)
- [Scheduler API](./docs/api/scheduler.md)
- [Connector worker](./docs/api/connectors.md)
- [Tool sandbox](./docs/api/tool-sandbox.md)

## Current Gaps

These areas remain between "locally green" and a final deployment-ready claim:

- record live-broker RabbitMQ and Redis validation before claiming broker-backed queue support as release-ready
- record evidence-backed Rust sandbox validation on Linux if level 4 native enforcement will be claimed across both supported platforms

## Repository URL

- Source: https://github.com/Hyper66666/SenClaw
- Issues: https://github.com/Hyper66666/SenClaw/issues


