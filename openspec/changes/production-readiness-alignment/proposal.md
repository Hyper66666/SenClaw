## Why

Senclaw's core runtime is largely implemented, but the repository's claimed completion state is ahead of what has been verified. Production-readiness decisions are currently distorted by spec drift, stale documentation, failing `verify`, and a few real runtime gaps in the web console, connector worker, Rust sandbox integration, and scheduler closure work.

## What Changes

- Establish a release-readiness baseline that defines what may be claimed as complete only after `test`, `test:integration`, and `verify` are reconciled with repository truth.
- Align OpenSpec task state, README content, and production-readiness documentation with the code that actually exists and the checks that actually pass.
- Add authenticated web console requirements so the UI works against the gateway's default API authentication model and handles `204 No Content` flows correctly.
- Add concrete production queue connector requirements for RabbitMQ and Redis drivers, including lifecycle management, reconnect behavior, message acknowledgement, retry/dead-letter integration points, and observability.
- Add Rust sandbox validation requirements so the native runner is treated as complete only after it is built, invoked, and verified through the TypeScript host integration.
- Close remaining scheduler readiness gaps by codifying residual verification, repository/test coverage expectations, and the distinction between implemented behavior and unfinished spec bookkeeping.

## Capabilities

### New Capabilities
- `release-readiness-baseline`: Defines the repository truth model for readiness claims, verification gates, and documentation/task alignment.
- `web-console-authenticated-operations`: Defines authenticated web console API behavior, token propagation, and `204`-safe client handling.
- `queue-connector-runtime`: Defines production queue connector runtime behavior for concrete drivers, retries, acknowledgements, and lifecycle.
- `rust-sandbox-validation`: Defines build and runtime validation requirements for the native sandbox runner and its TypeScript integration.
- `scheduler-readiness-closure`: Defines remaining scheduler verification, test coverage, and state-alignment requirements needed for production claims.

### Modified Capabilities
- None.

## Impact

- Affected code: `apps/web`, `apps/gateway`, `packages/connector-worker`, `apps/tool-runner-host`, `native/sandbox-runner`, `packages/scheduler`, `packages/storage`
- Affected docs/specs: `README.md`, `PRODUCTION_READINESS.md`, `openspec/**/*`
- Affected verification: `pnpm run verify`, `pnpm run test`, `pnpm run test:integration`, native Rust build checks, queue-driver integration checks
- Potential new dependencies: concrete queue client libraries and documented local/CI prerequisites for Rust and broker-backed integration tests