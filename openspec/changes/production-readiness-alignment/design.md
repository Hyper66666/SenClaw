## Context

Senclaw has reached the stage where most core subsystems exist, but release-readiness evidence is fragmented. `pnpm run test` and `pnpm run test:integration` are green, `pnpm run verify` is still red, several OpenSpec task files lag behind the code, and top-level docs still make claims that do not match the repository's current metadata, scripts, or verification state.

This change is cross-cutting because it touches the release gate itself and four production-significant gaps that remain outside the current "mostly done" narrative: authenticated web console behavior, concrete queue connector drivers, native Rust sandbox validation, and final scheduler closure work. The stakeholders are maintainers deciding what can be claimed as complete, operators deploying Senclaw, and contributors using OpenSpec as the source of truth.

Constraints:
- The repository already contains substantial in-flight work across multiple changes; this change must align truth without rewriting completed subsystems.
- Windows and Linux are the supported platforms for native validation and development workflow.
- Queue runtime work must fit the existing connector lifecycle model instead of introducing an unrelated worker architecture.
- Scheduler closure must preserve the dedicated `apps/scheduler` process as the authoritative runtime.

## Goals / Non-Goals

**Goals:**
- Define a single release-readiness baseline for what may be marked complete in code, docs, and OpenSpec.
- Close the web console's authenticated API gap and its `204 No Content` handling bug.
- Move queue connectors from abstract runtime hooks to concrete production-capable driver implementations.
- Validate the native Rust sandbox path on supported platforms and make its readiness state explicit.
- Finish scheduler closure work by aligning docs, OpenSpec state, verification evidence, and residual repository coverage.

**Non-Goals:**
- Redesigning the overall Senclaw architecture or splitting services into new runtimes.
- Adding new broker types beyond the first production queue drivers in this phase.
- Replacing SQLite, reworking scheduler semantics, or introducing distributed scheduling.
- Building a full end-user authentication product for the web console beyond API-key session support.
- Declaring every repository-wide formatting cleanup as scheduler or connector work; formatting is part of release alignment, not subsystem redesign.

## Decisions

### 1. Use one umbrella change for release-readiness closure
- Decision: Track repository truth alignment and the remaining production blockers in one OpenSpec change.
- Rationale: The highest-risk issue is not a single missing feature; it is contradictory completion signals across docs, tests, and task files. A single umbrella change keeps the release gate, subsystem gaps, and docs alignment coupled.
- Alternatives considered:
  - Split into per-module changes: cleaner ownership, but it hides cross-cutting release criteria and encourages more drift.
  - Fix docs only: insufficient because several runtime gaps are real, not editorial.

### 2. Treat `pnpm run verify` as the authoritative release gate
- Decision: Module and platform readiness claims must be based on the full verification contract, not just unit and integration tests.
- Rationale: Current test success already coexists with stale docs and formatting failures. Without a single authoritative gate, the repository will continue to over-report completion.
- Alternatives considered:
  - Use `test` plus `test:integration` only: faster but allows docs/config drift.
  - Defer `verify` cleanup: acceptable temporarily for development, not for release claims.

### 3. Add lightweight web-console API-key sessions instead of a full auth flow
- Decision: The web console should support operator-provided bearer tokens for protected API calls and persist them only in a lightweight client session mechanism.
- Rationale: Senclaw already authenticates with API keys. The missing production behavior is token propagation and auth-aware UX, not an OAuth-style login product.
- Alternatives considered:
  - Build-time token only: too rigid for real operator use.
  - Full login UI and token minting workflow: heavier than the current need and outside scope.

### 4. Implement queue drivers as adapters behind the existing queue connector interface
- Decision: RabbitMQ and Redis queue support should be added as concrete driver implementations behind `QueueDriver`, preserving the current lifecycle contract.
- Rationale: The abstraction already exists. Filling in concrete drivers keeps gateway/runtime wiring stable while enabling broker-specific reconnection, ack/nack, and observability behavior.
- Alternatives considered:
  - Replace the connector-worker queue abstraction: unnecessary churn.
  - Add only one broker: reduces immediate complexity but leaves the production plan incomplete.

### 5. Treat Rust sandbox completion as binary-first, evidence-backed readiness
- Decision: Level 4 sandbox support is complete only when the native binary is built and exercised on supported platforms, with explicit documentation for missing-binary behavior.
- Rationale: The current TypeScript-side contract is strong, but skipped native-binary checks are not release evidence.
- Alternatives considered:
  - Treat contract tests as sufficient: they do not prove the binary actually builds or runs.
  - Make native validation mandatory in every local test run: too heavy for all contributors; CI and recorded verification are the correct baseline.

### 6. Keep scheduler closure focused on truth alignment and targeted test coverage
- Decision: Scheduler follow-up work should verify schema/repository coverage, task alignment, and standalone-process verification rather than reopen the scheduler architecture.
- Rationale: The core scheduler path is already implemented and manually validated. The remaining risk is stale state reporting and a few residual gaps in coverage and documentation.
- Alternatives considered:
  - Re-scope scheduler as a new feature build: wastes effort and obscures what is already finished.
  - Ignore stale task state: preserves confusion and weakens OpenSpec as a release instrument.

## Risks / Trade-offs

- [Umbrella scope becomes too broad] -> Sequence work in phases: truth alignment first, then web/queue/native gaps, then final scheduler closure.
- [Repository-wide verify cleanup touches unrelated files] -> Keep formatting-only changes separated from behavioral fixes and document why each broad cleanup is necessary.
- [Web-console token storage introduces operator-side security trade-offs] -> Use the lightest practical persistence, document its limits, and avoid claiming it is a full authentication product.
- [Broker-backed queue tests increase local and CI complexity] -> Use layered testing: unit tests with fakes, targeted integration tests for driver behavior, optional broker-backed jobs in CI where needed.
- [Native Rust validation becomes platform-fragile] -> Limit formal support to Windows and Linux, document prerequisites explicitly, and keep failure modes operator-readable.
- [Scheduler closure work reopens already-finished code paths] -> Constrain the change to alignment, targeted tests, and release evidence unless a verified defect is found.

## Migration Plan

1. Establish the release-readiness baseline and reconcile top-level docs and OpenSpec task files with current repository truth.
2. Fix the web console's authenticated request flow and `204` handling, then verify it against the gateway's default auth mode.
3. Implement concrete RabbitMQ and Redis queue drivers behind the existing connector runtime, with observability and reconnect handling.
4. Build and validate the native Rust sandbox on Windows and Linux, then make binary-backed verification part of readiness evidence.
5. Finish scheduler closure by aligning stale task state, validating residual storage coverage, and preserving standalone-process verification.
6. Re-run the readiness commands and update documentation only after the authoritative verification state is known.

Rollback approach:
- Documentation/task alignment can be reverted independently from runtime work.
- Queue drivers should be introduced behind explicit configuration so unsupported brokers can be disabled without affecting webhook/polling behavior.
- Native Rust validation changes should preserve clear fallback/error behavior when the binary is unavailable.

## Open Questions

- Should Redis queue support target Redis Streams only, or also support simpler list-based consumption in the first production phase?
- Which broker-backed integration checks should be mandatory in CI versus optional/manual for local development?
- Should the web console persist API tokens only for the active session or allow explicit opt-in longer persistence for operators?
- Do we want `verify` to remain a monolithic repository gate, or should part of the formatting cleanup be isolated before this change lands?