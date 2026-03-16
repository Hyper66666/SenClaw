## Context

Recent work closed the Windows go-live baseline, but it also exposed accumulating engineering debt in the first-party codebase. The most meaningful issues are duplicated `Agent` / `Run` / `Message` contracts between CLI and Web, repeated page or command boilerplate for loading, errors, and API failures, and oversized assembly files such as gateway `createServer()` and the sandbox runner implementation. These are not immediate product bugs, but they now affect change velocity and increase the chance of contract drift or risky edits.

The design must improve maintainability without turning this into a broad rewrite. External API behavior, storage behavior, and operator workflows should remain stable while the internals are reorganized.

## Goals / Non-Goals

**Goals:**
- Create a single canonical source for first-party client DTOs that CLI and Web can consume.
- Reduce the size and responsibility concentration of runtime assembly files by extracting cohesive helpers.
- Remove repeated CLI and Web boundary boilerplate where the repetition is already mechanical.
- Establish a documented error-handling taxonomy and align the highest-friction hotspots with it.

**Non-Goals:**
- No gateway API redesign, transport change, or storage schema change.
- No full frontend redesign or CLI UX redesign.
- No "split every large file" exercise; data-heavy files such as locale copy tables are not refactored solely because of line count.
- No requirement to eliminate every duplicated line in the repository.

## Decisions

### 1. Reuse protocol-owned DTOs as the first-party contract source

Instead of creating a new shared package, this change should reuse `@senclaw/protocol` as the source of truth for `Agent`, `Run`, and `Message`, with thin client-facing aliases or helpers where needed. This keeps type ownership aligned with the existing schema package and avoids inventing a parallel contract layer.

Alternatives considered:
- Create a new `@senclaw/client-contracts` package: rejected because it would duplicate the role already played by `@senclaw/protocol`.
- Leave CLI and Web local DTOs in place: rejected because it preserves drift risk.

### 2. Keep `server.ts` and `sandbox.ts` as entrypoints, but move assembly details out

The gateway server file should remain the top-level composition root, but storage wiring, auth wiring, connector lifecycle setup, and route registration should move into dedicated helpers. The sandbox runner should similarly separate worker source, filesystem policy, network policy, resource monitoring, and process orchestration into focused modules.

Alternatives considered:
- Introduce a DI container framework: rejected as too heavy for current needs.
- Full package extraction for each concern: rejected because the problem is concentration, not packaging.

### 3. Introduce one boundary abstraction per repeated surface pattern

CLI should gain a shared command wrapper such as `withApiCommand()` for repeated `try/catch + handleAPIError` flows. Web should gain a shared query boundary primitive for repeated loading/error rendering patterns in list and detail pages. These abstractions should be intentionally narrow and should not try to hide all differences between commands or pages.

Alternatives considered:
- Keep all page or command code explicit: rejected because repetition is already mechanical.
- Build highly generic page factories: rejected because they would add indirection faster than they remove cost.

### 4. Normalize error handling through policy, not through identical catch blocks

The system should explicitly classify catches as one of: fail-fast, degrade-and-continue, retry/poll, or intentionally swallowed with rationale. The goal is not to make all layers behave identically; it is to make the behavior deliberate and auditable. Operator-facing surfaces must remain consistent for `401`, `403`, missing configuration, and network failures.

Alternatives considered:
- Force all catches to rethrow: rejected because some long-polling and optional-runtime paths intentionally degrade.
- Leave conventions implicit: rejected because the codebase is already producing mixed patterns.

## Risks / Trade-offs

- [Refactor spread across multiple apps] -> Mitigation: keep the change focused on shared patterns already called out in review; avoid opportunistic rewrites.
- [Contract consolidation may expose type mismatches] -> Mitigation: convert CLI and Web incrementally and keep existing tests green after each surface moves.
- [New abstractions may over-generalize] -> Mitigation: introduce only one narrow abstraction per repeated pattern and stop once duplication is materially reduced.
- [Assembly file splits can hide flow] -> Mitigation: keep `server.ts` and `sandbox.ts` as readable entrypoints that still show the top-level sequence.

## Migration Plan

1. Consolidate first-party DTO ownership and refactor imports in CLI and Web.
2. Extract gateway and sandbox helper modules while preserving entrypoint flow.
3. Introduce CLI and Web boundary abstractions, then migrate the repeated callers.
4. Write the error-handling policy note and align the major hotspots.
5. Re-run build, test, and verify to ensure behavior stayed stable.

No deployment migration or rollback procedure is required beyond normal git rollback because this change is intended to preserve runtime behavior.

## Open Questions

- Whether Web should consume protocol types directly or through a small client adapter layer for browser-facing convenience.
- Whether the error-handling policy should live inside `PRODUCTION_READINESS.md`, a separate engineering decision doc, or both.
- Whether any of the gateway helper extractions should become reusable modules, or remain app-local.
