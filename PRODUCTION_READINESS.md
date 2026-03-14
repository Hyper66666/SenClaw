# Senclaw Production Readiness

This document records the current release-readiness truth for Senclaw. It is intentionally stricter than feature-complete marketing language: a subsystem is only treated as release-ready when the implementation, OpenSpec state, and verification evidence line up.

## Go-Live Status Summary

As of March 14, 2026, Senclaw is locally green on Windows and can be used for internal or controlled deployment trials. The baseline go-live gate is close, but it is not fully closed yet.

Baseline evidence already recorded:

- `pnpm run build`: pass
- `pnpm run test`: pass (`46` test files, `267` tests)
- `pnpm run test:integration`: pass (`6` test files, `20` tests) plus an opt-in live-broker suite (`1` file, `4` skipped without broker env)
- `pnpm run verify`: pass
- real OpenAI-compatible smoke validation: pass on March 12, 2026 against the Volcengine Ark OpenAI-compatible endpoint using model `doubao-seed-2.0-pro`; the smoke prompt returned `OK`

Baseline blockers still open:

- rerun the readiness matrix on the supported runtime, Node.js `>=22.0.0`
- record protected web-console acceptance against an authentication-enabled gateway

Optional production extensions that are currently NOT claimed:

- live-broker validated RabbitMQ support
- live-broker validated Redis support
- cross-platform Rust level 4 sandbox readiness

## Evidence Baseline

Latest local Windows verification on March 14, 2026 (Node `v20.11.0`, with engine warning because the repository requires Node 22+):

- `pnpm run build`: pass
- `pnpm run test`: pass (`46` test files, `267` tests)
- `pnpm run test:integration`: pass (`6` test files, `20` tests)
- `pnpm run verify`: pass
- `cargo build --release --manifest-path native/sandbox-runner/Cargo.toml`: pass
- `pnpm run test:provider-smoke`: pass against an operator-supplied Ark endpoint and model; assistant response was `OK`

Authoritative deployment gate:

1. Supported runtime: Node.js `>=22.0.0`, pnpm `>=10.0.0`
2. `pnpm run build`
3. `pnpm run test`
4. `pnpm run test:integration`
5. `pnpm run verify`
6. Real OpenAI-compatible smoke validation
7. Protected web-console acceptance against an authentication-enabled gateway
8. Native sandbox validation on supported platforms only when level 4 readiness is claimed
9. Broker-backed queue validation only when RabbitMQ or Redis support is claimed

Current baseline blockers:

- the readiness matrix still needs to be rerun on supported Node 22
- protected web-console acceptance against an authenticated gateway has not yet been recorded

Conditional blockers:

- RabbitMQ and Redis drivers are implemented locally, but live-broker validation is still incomplete
- Linux native sandbox validation is still incomplete for Rust level 4 claims

## Release Summary

Implemented and locally verified:

- core runtime foundation
- persistent SQLite storage
- API-key authentication and RBAC
- observability metrics and tracing wiring
- web console core flows, including authenticated API-key session support
- standalone scheduler app and gateway job routes
- connector worker webhook flow, polling support, concrete RabbitMQ and Redis queue drivers, and default gateway queue dispatch
- TypeScript tool sandbox levels 0 through 3
- repository-wide `verify` gate
- real-provider smoke path through the existing `openai` provider integration
- Windows native sandbox release build path

Implemented but not fully release-closed:

- protected web-console acceptance still needs a recorded run against a protected gateway
- Rust sandbox level 4 integration exists, with local Windows build evidence recorded; Linux build validation is still pending
- broker-backed queue drivers exist with unit coverage and runtime wiring, but live-broker validation is not yet recorded

Not release-ready to claim today:

- baseline deployment readiness on the officially supported runtime, until Node 22 evidence is recorded
- production RabbitMQ/Redis queue-driver support
- complete binary-backed Rust sandbox support on both supported platforms

## Real Provider Smoke Evidence

Recorded on March 12, 2026.

Procedure:

1. Set operator-local environment variables `SENCLAW_OPENAI_API_KEY`, `SENCLAW_OPENAI_BASE_URL`, and `SENCLAW_OPENAI_MODEL`.
2. Run `corepack pnpm run test:provider-smoke`.
3. Confirm the temporary run completes and the script prints a completed status plus the assistant response.

Recorded result:

- base URL: `https://ark.cn-beijing.volces.com/api/coding/v3`
- model: `doubao-seed-2.0-pro`
- final status: `completed`
- assistant response: `OK`

Expected failure modes:

- missing env vars: the script fails fast with a configuration error
- invalid key or provider auth failure: the run fails with a provider error that remains diagnosable in script output
- quota, endpoint, or network issue: the run fails without silently falling back to mock behavior

## Subsystem Status

### Core Runtime Foundation

Status: implemented and locally green

Evidence:

- build, unit, integration, and verify commands all pass locally
- gateway, agent runner, and tool host all start under current workspace scripts

Remaining blocker:

- supported-runtime rerun on Node 22

### Persistent Storage

Status: implemented and verified in local unit/integration runs

Evidence:

- SQLite-backed repositories are active in gateway and scheduler paths
- persistence contract and scheduler integration tests pass

Remaining blocker:

- supported-runtime rerun on Node 22 as part of the final baseline evidence

### API Authentication

Status: implemented and verified

Evidence:

- protected gateway routes reject missing or invalid keys
- bootstrap and managed-key flows are covered by tests
- web console supports operator-provided bearer tokens

### Observability

Status: implemented and locally verified

Evidence:

- metrics and tracing tests pass
- gateway, agent, tool, and scheduler observability wiring is active

Remaining blocker:

- supported-runtime rerun on Node 22 as part of the final baseline evidence

### Web Console

Status: functionally usable, with proxy-backed authenticated acceptance partially recorded

Evidence:

- authenticated API-key session support is implemented in the header UI
- protected requests attach `Authorization: Bearer <token>`
- protected requests fail fast with a recoverable UI prompt when no token is configured
- `204 No Content` delete flows no longer throw parse errors
- dedicated web auth/session tests pass
- the operator checklist exists in [apps/web/README.md](./apps/web/README.md)
- on March 14, 2026, authenticated requests through the local web proxy returned the expected statuses: list agents `200`, create agent `201`, submit task `201`, inspect run `200`, and delete agent `204`
- on March 14, 2026, a real-provider run created from the local runtime completed successfully and produced an assistant reply

Remaining blockers:

- browser-level UI recovery evidence for missing, invalid, and revoked tokens is still pending because local Playwright Chrome launch exits with code 13 on this workstation
- supported-runtime rerun on Node 22 as part of the final baseline evidence

### CLI Tool

Status: implemented enough for real use, but release packaging is incomplete

Evidence:

- `@senclaw/cli` exists in the workspace
- the root `senclaw.cmd` launcher now invokes the built CLI instead of `tsx`
- `senclaw --help` succeeds locally through the JS launcher path
- local runtime launchers generate and execute `scripts/local-runtime.js` instead of requiring `tsx` at runtime

Remaining blockers:

- release packaging and npm publication workflow
- broader CLI-specific test coverage and docs alignment
- supported-runtime rerun on Node 22 as part of the final baseline evidence

### Connector Worker

Status: usable for webhook, polling, and broker-backed queue development flows, but not yet live-broker claim ready

Evidence:

- webhook flow is implemented and integration-tested
- polling connector exists and change detection is covered by unit tests
- queue lifecycle integration exists through `BrokerQueueDriver` plus concrete RabbitMQ and Redis drivers
- queue config validation covers provider-specific RabbitMQ and Redis schemas
- unit tests cover driver dispatch, recovery, ack, nack, requeue, and dead-letter behavior
- opt-in live-broker integration coverage now exists in `tests/integration/queue-brokers-live.test.ts` for RabbitMQ and Redis startup plus message-processing and dead-letter verification
- the live-broker suite skips cleanly when `SENCLAW_TEST_RABBITMQ_URL` and `SENCLAW_TEST_REDIS_URL` are not configured

Remaining blockers:

- live RabbitMQ validation is not yet recorded
- live Redis validation is not yet recorded
- release-ready broker-backed queue claims should stay disabled until that evidence exists

### Scheduler

Status: core behavior implemented and strongly verified

Evidence:

- standalone scheduler process is the active runtime model
- gateway job CRUD plus execution history are implemented
- scheduler unit tests and integration tests pass
- manual restart and persistence validation has already been recorded in the scheduler change

Remaining blocker:

- supported-runtime rerun on Node 22 as part of the final baseline evidence

### Tool Sandbox

Status: strong TypeScript sandbox path, partial native validation state

Evidence:

- isolation levels 0 through 3 are covered by unit and integration tests
- level 4 Rust runner contract is integrated into the host
- the current unit suite includes a CLI-contract test that uses a real binary when one is already present locally
- Windows native sandbox build evidence was revalidated on March 12, 2026
- CI now includes an explicit release build step for `native/sandbox-runner`

Remaining blockers:

- dedicated Linux `cargo build --release` evidence is not yet recorded as release verification
- binary-backed validation is not yet fully closed until Linux evidence exists

## Supported Platforms

Supported platforms for development and release verification:

- Windows
- Linux

Required runtime versions:

- Node.js `>=22.0.0`
- pnpm `>=10.0.0`

## Operator Guidance

Use Senclaw today when all of the following are acceptable:

- you are operating on a locally verified build and understand the final supported-runtime rerun is still pending
- your connector needs are satisfied by webhooks or polling, or you are comfortable using the built-in broker drivers before live-broker release evidence is recorded
- your sandbox threat model is covered by the current TypeScript isolation path rather than requiring fully validated native level 4 enforcement

Do not claim full deployment readiness until:

1. the readiness matrix is rerun on Node 22
2. protected web-console acceptance is recorded
3. queue-driver support is explicit about what brokers are bundled and verified when broker-backed support is claimed
4. Rust sandbox validation has been recorded on both Windows and Linux when native level 4 support is claimed

## Next Priority Work

1. Re-run the green repository gate on Node 22 and record the evidence.
2. Record browser-level protected web-console recovery evidence for missing, invalid, and revoked tokens once the local Playwright/Chrome blocker is removed or a manual operator pass is completed.
3. Record RabbitMQ and Redis live-broker validation if broker-backed support is required.
4. Record dedicated Linux native sandbox build validation if level 4 native sandbox claims are required.




