# Senclaw

[English](./README.md) | [简体中文](./README.zh-CN.md)

Senclaw is an AI agent orchestration platform with persistent storage, API-key authentication, a web console, connector ingestion, scheduling, sandboxed tool execution, and an evolving long-lived agent runtime.

The codebase is feature-rich and the repository gate is now green locally. As of March 16, 2026, the Windows baseline go-live gate has been closed with recorded Node 22 verification and browser-level protected web-console acceptance. RabbitMQ and Redis Streams queue drivers are implemented in-tree with unit coverage and default gateway wiring, but live-broker release evidence is still pending.

## Readiness Snapshot

Latest local evidence on April 1, 2026:

- `pnpm run build`: pass
- `pnpm run test`: pass (`72` test files, `330` tests)
- `pnpm run test:integration`: pass (`7` test files, `21` tests) plus an opt-in live-broker suite (`1` file, `4` skipped without broker env)
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

This machine still uses Node `v20.11.0` as the default local install, so commands succeed with engine warnings unless a Node 22 runtime is selected. The supported-runtime gate has already been revalidated locally with portable Node `v22.22.1`.

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

## One-Click Local Runtime

For a local all-in-one SenClaw session, use the launcher scripts:

```bash
# Windows
scripts\start-senclaw.cmd
scripts\stop-senclaw.cmd

# Linux
./scripts/start-senclaw.sh
./scripts/stop-senclaw.sh
```

If you are already in the repository root on Windows `cmd`, you can also use:

```bat
senclaw start
senclaw stop
```

## Authentication

Gateway API routes under `/api/v1/*` require a bearer API key by default.

Create or bootstrap a key:

```bash
corepack pnpm run auth:bootstrap-admin
```

The web console header includes an API-key session form so protected views can call the gateway without a separate login flow.

## Agent Runtime Highlights

Recent runtime additions now available in-tree:

- persisted background agent tasks with transcript history and follow-up queues
- `agent_tasks.*` orchestration tools for spawning, inspecting, resuming, and messaging long-lived workers
- declarative agent definitions with runtime fields such as `mode`, `background`, `maxTurns`, `effort`, and `isolation`
- coordinator-mode tool filtering and orchestration prompt wiring
- tool-level concurrency batching for explicitly safe tools

See [docs/api/agent-runtime.md](./docs/api/agent-runtime.md) for the current runtime model.

## Verification Commands

```bash
corepack pnpm run build
corepack pnpm run test
corepack pnpm run test:integration
corepack pnpm run verify
```

## Key Docs

- [Production readiness](./PRODUCTION_READINESS.md)
- [Agent runtime](./docs/api/agent-runtime.md)
- [Web console](./apps/web/README.md)
- [Scheduler API](./docs/api/scheduler.md)
- [Connector worker](./docs/api/connectors.md)
- [Tool sandbox](./docs/api/tool-sandbox.md)

## Current Gaps

These areas remain between "locally green" and a final deployment-ready claim:

- record live-broker RabbitMQ and Redis validation before claiming broker-backed queue support as release-ready
- record evidence-backed Rust sandbox validation on Linux if level 4 native enforcement will be claimed across both supported platforms
- finish the remaining agent-runtime-evolution tasks for delegated subagent execution proofs, coordinator behavior coverage, and final surface/documentation polish

## Repository URL

- Source: https://github.com/Hyper66666/SenClaw
- Issues: https://github.com/Hyper66666/SenClaw/issues
