## 1. Shared Client Contracts

- [x] 1.1 Inventory duplicated first-party `Agent`, `Run`, and `Message` DTOs across Web, CLI, and protocol.
- [x] 1.2 Decide the canonical shared contract export shape inside `@senclaw/protocol` or a thin adjacent adapter module.
- [x] 1.3 Refactor Web API types to consume the shared contract source.
- [x] 1.4 Refactor CLI API types to consume the shared contract source.
- [x] 1.5 Extract shared status-to-variant helpers for repeated run and health badge mappings.
- [x] 1.6 Update client tests to prove the shared contracts and status helpers are being consumed.

## 2. Gateway Assembly Decomposition

- [x] 2.1 Split gateway storage, auth, connector, and route wiring into focused helper modules.
- [x] 2.2 Reduce `apps/gateway/src/server.ts` to a readable composition root that preserves startup order.
- [x] 2.3 Keep existing gateway behavior and hooks intact while moving the implementation.
- [x] 2.4 Update gateway tests if helper extraction changes import paths or bootstrapping seams.

## 3. Sandbox Decomposition

- [x] 3.1 Extract sandbox worker-source handling into a dedicated module.
- [x] 3.2 Extract filesystem policy guards into a dedicated module.
- [x] 3.3 Extract network policy guards into a dedicated module.
- [x] 3.4 Extract resource-monitoring logic into a dedicated module.
- [x] 3.5 Refactor `sandbox.ts` into a thinner orchestrator over the extracted modules.
- [x] 3.6 Re-run sandbox unit and integration tests to prove behavior parity.

## 4. First-Party Surface Boundaries

- [x] 4.1 Add a shared CLI command wrapper for repeated API error-handling flows.
- [x] 4.2 Refactor CLI `agent`, `run`, `task`, `health`, and `runtime` commands to use the wrapper where applicable.
- [x] 4.3 Add a shared Web query boundary abstraction for repeated loading and error rendering.
- [x] 4.4 Refactor Web list and detail pages with repeated query-state patterns to use the boundary abstraction.
- [x] 4.5 Leave pages with materially different control flow explicit and document why they stay outside the abstraction.

## 5. Error Handling Policy

- [x] 5.1 Write a short engineering policy note for fail-fast, degrade, retry, and intentionally swallowed catches.
- [x] 5.2 Inventory the current first-party catch hotspots and classify them against the policy.
- [x] 5.3 Refactor the highest-noise hotspots so the intended handling strategy is explicit in code.
- [x] 5.4 Align first-party auth and permission error translation with the shared policy.

## 6. Verification

- [x] 6.1 Run `corepack pnpm run build`.
- [x] 6.2 Run `corepack pnpm run test`.
- [x] 6.3 Run `corepack pnpm run verify`.
- [x] 6.4 Update this change record if the final scope intentionally excludes any initially proposed hotspot.

Scope note: locale.ts remains a data-heavy copy table by design, and packages/cli/src/commands/runtime.ts stays explicit because it orchestrates local processes rather than gateway API calls.

