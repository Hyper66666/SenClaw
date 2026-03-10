## Why

The core runtime foundation stores all state 鈥?agent definitions, runs, and messages 鈥?in process memory using `Map`-based repositories. This was intentional for the first cut: it allowed the system to start with zero external dependencies while the domain model stabilized. That tradeoff is no longer acceptable for ongoing development. Every process restart discards all agents and run history, making it impossible to iterate on agent configurations, inspect past runs, or develop features (scheduler, connector workers) that depend on durable state.

Without persistent storage, Senclaw cannot progress beyond a local demonstration. The scheduler cannot reference run history. The connector worker cannot resume sessions. The web console has nothing to display after a restart. Persistent storage is the prerequisite for every remaining feature on the roadmap.

## What Changes

- Extract explicit repository interfaces (`IAgentRepository`, `IRunRepository`, `IMessageRepository`) from the concrete in-memory implementations so the service layer depends on contracts, not implementations.
- Add a new shared package `@senclaw/storage` that provides SQLite-backed implementations of all three repository interfaces using Drizzle ORM.
- Add a `packages/storage` package with the Drizzle schema definitions, migration runner, and repository implementations for SQLite.
- Extend `@senclaw/config` to include the database connection URL (`SENCLAW_DB_URL`) as an optional setting; when unset, the runtime keeps the in-memory repositories as default.
- Replace the in-memory repository instantiation in the gateway startup with the SQLite-backed implementations when a `SENCLAW_DB_URL` is configured; keep the in-memory repositories available as a test override.
- Add a database health-check implementation that verifies connectivity and exports it through `@senclaw/observability`.
- Preserve the in-memory repository classes and make them the default when no `SENCLAW_DB_URL` is set, so existing unit and integration tests continue to pass without any database present. Route handlers in `apps/gateway/src/routes/agents.ts` and `apps/gateway/src/routes/runs.ts` will also be updated to `await` async `AgentService` calls.

## Capabilities

### New Capabilities
- `repository-interfaces`: Explicit TypeScript interfaces for `IAgentRepository`, `IRunRepository`, and `IMessageRepository`, shared via `@senclaw/protocol` so any package can reference the contracts without depending on an implementation.
- `sqlite-storage`: A `@senclaw/storage` package that implements all three repository interfaces against a SQLite database via Drizzle ORM. Includes the Drizzle schema, a `createStorage(url)` factory, and a migration runner.
- `storage-config`: Extended configuration loading for optional `SENCLAW_DB_URL` and a database health-check component.

### Modified Capabilities
- `agent-execution`: `AgentRepository`, `RunRepository`, and `MessageRepository` classes are renamed to `InMemoryAgentRepository`, `InMemoryRunRepository`, and `InMemoryMessageRepository`, and now implement their respective interfaces. Service and execution-loop code is updated to accept interfaces.
- `gateway-api`: Gateway startup selects between the in-memory and SQLite repository implementations based on configuration. Health check includes database connectivity.
- `shared-infrastructure`: `@senclaw/config` gains the `dbUrl` field mapped to `SENCLAW_DB_URL`.

## Impact

- Adds a new workspace package `packages/storage` with dependencies on `drizzle-orm`, `better-sqlite3`, and `drizzle-kit` (dev).
- `@senclaw/protocol` gains three interface exports (`IAgentRepository`, `IRunRepository`, `IMessageRepository`).
- `@senclaw/config` adds one new optional config field (`dbUrl`) defaulting to `undefined`.
- `apps/agent-runner` concrete repository classes are renamed and now implement the new interfaces; all internal logic is unchanged.
- `apps/gateway` startup gains a storage-selection branch; no route handler changes in existing code paths; gateway route handlers in `apps/gateway/src/routes/agents.ts` and `apps/gateway/src/routes/runs.ts` must explicitly `await` async service calls when storage becomes async.
- All existing unit and integration tests continue to pass without change because the in-memory repositories remain the default when `SENCLAW_DB_URL` is not set.
- `.env.example`, `.env.windows.example`, and `.env.linux.example` are updated with `SENCLAW_DB_URL` documentation.
- `apps/connector-worker` and `apps/scheduler` remain stubs; they will import from `@senclaw/storage` in a future change when they gain real implementations.




