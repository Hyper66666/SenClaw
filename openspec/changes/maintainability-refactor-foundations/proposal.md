## Why

Senclaw's first-party surfaces have started to duplicate API contracts, page or command control-flow patterns, and runtime assembly logic. The current shape still works, but continued feature work will make review, testing, and change safety progressively worse unless the shared foundations are cleaned up now.

## What Changes

- Introduce a shared first-party contract layer for `Agent`, `Run`, and `Message` payloads so CLI and Web do not redefine the same DTOs.
- Centralize repeated first-party presentation helpers such as status-to-badge mapping where duplication is already spreading across pages.
- Decompose oversized runtime composition modules, especially gateway server assembly and tool sandbox orchestration, into smaller focused modules while preserving behavior.
- Add shared boundary abstractions for repeated CLI command error handling and repeated Web loading or error rendering patterns.
- Define and apply a layered error-handling policy so fail-fast, degrade, retry, and intentionally silent catches are explicit instead of incidental.

## Capabilities

### New Capabilities
- `shared-client-contracts`: Canonical first-party client DTOs and shared status semantics are defined once and reused across surfaces.
- `composable-runtime-assembly`: Gateway and sandbox composition roots are decomposed into dedicated assembly modules with stable behavior.
- `first-party-surface-boundaries`: CLI command actions and Web query-driven pages use shared boundary abstractions instead of duplicating boilerplate.
- `layered-error-handling-policy`: First-party runtimes classify and document their error-handling strategies consistently.

### Modified Capabilities

- None.

## Impact

- Affected code: `apps/gateway`, `apps/tool-runner-host`, `apps/web`, `packages/cli`, `packages/protocol`
- Affected tests: gateway, tool host, web, and CLI unit coverage will need updates to match the new shared modules
- APIs: no intended external API or storage behavior change
- Dependencies: no new third-party dependency is required
