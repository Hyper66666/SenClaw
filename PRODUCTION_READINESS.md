# Senclaw Production Readiness

This document records the current release-readiness truth for Senclaw. It is intentionally stricter than feature-complete marketing language: a subsystem is only treated as release-ready when the implementation, OpenSpec state, and verification evidence line up.

## Evidence Baseline

Latest local Windows verification on March 12, 2026:

- `pnpm run build`: pass
- `pnpm run test`: pass (`28` test files, `195` tests)
- `pnpm run test:integration`: pass (`6` test files, `20` tests)
- `pnpm run verify`: fail (`42` Biome formatting errors)

Authoritative release gate:

1. `pnpm run build`
2. `pnpm run test`
3. `pnpm run test:integration`
4. `pnpm run verify`
5. Native sandbox validation on supported platforms when level 4 readiness is claimed

Current release blocker:

- `pnpm run verify` is still red because of repository-wide formatting drift.

Representative `verify` blocker examples from the March 12, 2026 run:

- `packages/connector-worker/tsconfig.json`
- `apps/agent-runner/src/agent-service.ts`
- `apps/agent-runner/src/model-provider.ts`
- `apps/agent-runner/src/repositories.ts`
- `apps/gateway/src/routes/runs.ts`
- `apps/gateway/src/routes/tasks.ts`
- `apps/gateway/src/server.ts`
- `apps/connector-worker/package.json`
- `packages/cli/src/commands/config.ts`
- `packages/cli/src/commands/health.ts`

## Release Summary

Implemented and locally verified:

- core runtime foundation
- persistent SQLite storage
- API-key authentication and RBAC
- observability metrics and tracing wiring
- web console core flows, including authenticated API-key session support
- standalone scheduler app and gateway job routes
- connector worker webhook flow, polling support, and queue lifecycle contract
- TypeScript tool sandbox levels 0 through 3

Implemented but not fully release-closed:

- queue connectors need concrete RabbitMQ and Redis driver implementations before broker-backed production claims
- Rust sandbox level 4 integration exists, with local Windows build evidence now recorded; Linux build validation is still pending
- several older OpenSpec task files lag behind the code and verification state

Not release-ready to claim today:

- full repository readiness, because `verify` is still failing
- production RabbitMQ/Redis queue-driver support
- complete binary-backed Rust sandbox support on both supported platforms

## Subsystem Status

### Core Runtime Foundation

Status: implemented, tested, blocked only by repository-wide `verify`

Evidence:

- build passes
- unit and integration suites pass
- gateway, agent runner, and tool host all start under current workspace scripts

### Persistent Storage

Status: implemented and verified in local unit/integration runs

Evidence:

- SQLite-backed repositories are active in gateway and scheduler paths
- persistence contract and scheduler integration tests pass

Remaining blocker:

- repository-wide `verify` cleanup

### API Authentication

Status: implemented and verified

Evidence:

- protected gateway routes reject missing or invalid keys
- bootstrap and managed-key flows are covered by tests
- web console now supports operator-provided bearer tokens

### Observability

Status: implemented and locally verified

Evidence:

- metrics and tracing tests pass
- gateway, agent, tool, and scheduler observability wiring is active

Remaining blocker:

- repository-wide `verify` cleanup

### Web Console

Status: functionally usable, not yet eligible for a full release-ready claim

Evidence:

- authenticated API-key session support is implemented in the header UI
- protected requests now attach `Authorization: Bearer <token>`
- protected requests fail fast with a recoverable UI prompt when no token is configured
- `204 No Content` delete flows no longer throw parse errors
- dedicated web auth/session tests pass

Remaining blockers:

- repository-wide `verify` cleanup
- explicit manual web-console verification against a protected gateway still needs to be recorded in the current release-alignment change

### CLI Tool

Status: implemented enough for real use, but release packaging is incomplete

Evidence:

- `@senclaw/cli` exists in the workspace
- build and command scaffolding are present

Remaining blockers:

- release packaging and npm publication workflow
- broader CLI-specific test coverage and docs alignment

### Connector Worker

Status: partially release-ready

Evidence:

- webhook flow is implemented and integration-tested
- polling connector exists and change detection is covered by unit tests
- queue lifecycle integration exists through the `QueueDriver` abstraction and runtime lifecycle wiring

Remaining blockers:

- RabbitMQ and Redis concrete drivers are not bundled yet
- queue reconnect, retry, ack/nack, and dead-letter semantics are not yet closed at the broker-driver level

### Scheduler

Status: core behavior implemented and strongly verified

Evidence:

- standalone scheduler process is the active runtime model
- gateway job CRUD plus execution history are implemented
- scheduler unit tests and integration tests pass
- manual restart/persistence validation has already been recorded in the scheduler change

Remaining blockers:

- repository-wide `verify` cleanup

### Tool Sandbox

Status: strong TypeScript sandbox path, partial native validation state

Evidence:

- isolation levels 0 through 3 are covered by unit and integration tests
- level 4 Rust runner contract is integrated into the host
- the current unit suite includes a CLI-contract test that uses a real binary when one is already present locally

Remaining blockers:

- dedicated Linux `cargo build` evidence is not yet recorded as release verification
- binary-backed validation is not yet formalized in CI or the release workflow

## Supported Platforms

Supported platforms for development and release verification:

- Windows
- Linux

Required runtime versions:

- Node.js `>=22.0.0`
- pnpm `>=10.0.0`

## Operator Guidance

Use Senclaw today when all of the following are acceptable:

- you can tolerate the current `verify` blocker being a release-management issue rather than a runtime failure
- your connector needs are satisfied by webhooks or polling, or by a custom in-process `QueueDriver`
- your sandbox threat model is covered by the current TypeScript isolation path rather than requiring fully validated native level 4 enforcement

Do not claim full production readiness until:

1. `pnpm run verify` is green
2. queue-driver support is explicit about what brokers are bundled and verified
3. Rust sandbox validation has been recorded on both Windows and Linux
4. stale OpenSpec task files have been reconciled with current code and evidence

## Next Priority Work

1. Clean up repository-wide Biome formatting drift so `pnpm run verify` becomes a real green gate.
2. Finish the current release-alignment change for web-console manual verification and task-state reconciliation.
3. Implement concrete RabbitMQ and Redis queue drivers behind `QueueDriver`.
4. Record dedicated Windows and Linux native sandbox build validation.
