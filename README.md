# Senclaw

Senclaw is an AI agent orchestration platform with persistent storage, API-key authentication, a web console, connector ingestion, scheduling, and sandboxed tool execution.

The codebase is feature-rich and the repository gate is now green locally. As of March 12, 2026, the latest local Windows verification shows `build`, `test`, `test:integration`, and `verify` all passing. RabbitMQ and Redis Streams queue drivers are now implemented in-tree with unit coverage and default gateway wiring, but live-broker release evidence is still pending. A real OpenAI-compatible smoke run is also recorded, so the remaining baseline go-live work is narrowed to a supported-runtime rerun on Node 22 and protected web-console acceptance.

## Readiness Snapshot

Latest local evidence on March 12, 2026 (Windows, Node `v20.11.0` with engine warning):

- `pnpm run build`: pass
- `pnpm run test`: pass (`33` test files, `217` tests)
- `pnpm run test:integration`: pass (`6` test files, `20` tests)
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

Current release claims must be based on all four commands. The remaining baseline sign-off work is a rerun on Node 22 plus protected web-console acceptance evidence.

## Key Docs

- [Production readiness](./PRODUCTION_READINESS.md)
- [Web console](./apps/web/README.md)
- [Scheduler API](./docs/api/scheduler.md)
- [Connector worker](./docs/api/connectors.md)
- [Tool sandbox](./docs/api/tool-sandbox.md)

## Current Gaps

These areas remain between "locally green" and a final deployment-ready claim:

- rerun the readiness matrix on supported Node 22
- record protected web-console acceptance against an authenticated gateway
- record live-broker RabbitMQ and Redis validation before claiming broker-backed queue support as release-ready
- record evidence-backed Rust sandbox validation on both Windows and Linux if level 4 native enforcement will be claimed

## Repository URL

- Source: https://github.com/Hyper66666/SenClaw
- Issues: https://github.com/Hyper66666/SenClaw/issues


