## Context

Senclaw's core runtime is fully functional but all storage is in-memory. The service layer 鈥?`AgentService` and the execution loop 鈥?depends directly on concrete `Map`-based repository classes defined in `apps/agent-runner/src/repositories.ts`. This change introduces durable storage by (1) extracting repository interfaces so the service layer is implementation-agnostic, and (2) providing SQLite-backed implementations as the runtime default.

The primary constraint remains iteration speed: the database schema will evolve as the domain model grows, so the storage layer must be easy to migrate. A second constraint is the cross-platform requirement 鈥?any storage solution must run on Windows and Linux without external server setup for local development.

## Goals / Non-Goals

**Goals:**
- Define explicit repository interfaces that the service layer and execution loop accept, enabling storage implementations to be swapped without touching business logic.
- Deliver SQLite-backed repository implementations using Drizzle ORM with a schema-driven migration model.
- Keep the in-memory repositories as a no-dependency fallback for tests and zero-config local starts.
- Extend configuration with an optional database URL. If not provided, the system defaults to in-memory repositories.
- Add a database health-check so the `/health` endpoint reflects storage availability.
- Ensure `pnpm run verify` and `pnpm run test` pass without a database present (in-memory fallback).

**Non-Goals:**
- PostgreSQL or other server-based database support (deferred; Drizzle's adapter pattern makes it a future change).
- Connection pooling or multi-process write contention handling.
- Full query API (pagination, filtering, sorting) on repository methods 鈥?the current CRUD surface is sufficient.
- Authentication, row-level security, or multi-tenancy.
- Data migration tooling for production deployments (deferred until there is a production environment).
- Encryption at rest.

## Decisions

### 1. Extract repository interfaces into `@senclaw/protocol`

Repository interfaces (`IAgentRepository`, `IRunRepository`, `IMessageRepository`) are defined in `@senclaw/protocol` alongside the domain types they operate on. This gives every package 鈥?agent runner, gateway, future connector worker, scheduler 鈥?a shared contract to import without creating a circular dependency on any implementation package.

Alternative considered: define interfaces in a new `@senclaw/repositories` package. Rejected because it adds a package boundary purely for interface definitions; `@senclaw/protocol` already owns domain types and is the natural home for the contracts that operate on them.

Alternative considered: define interfaces inline in `apps/agent-runner`. Rejected because it prevents the gateway and future services from referencing the contracts without importing the runner.

### 2. Use SQLite as the primary storage engine

SQLite runs in-process with no external server, works identically on Windows and Linux, and supports ACID transactions. The database file can be placed anywhere the process has write access, making it trivially portable. For the current scale (single-process, local development), SQLite's concurrency model (one writer at a time) is not a constraint.

Alternative considered: PostgreSQL as the primary store from the start. Rejected because it requires running a database server locally, complicates Windows development, and adds infrastructure complexity before there is a production deployment. Drizzle's adapter abstraction means switching to PostgreSQL later is a contained change.

Alternative considered: LowDB or JSON file storage. Rejected because it lacks ACID guarantees, has no query language, and offers no migration story.

Alternative considered: Turso (libSQL). Rejected because it introduces a network/cloud dependency; the goal is zero-infrastructure local dev.

### 3. Use Drizzle ORM for schema definition and queries

Drizzle ORM defines schemas in TypeScript, generates SQL migrations with `drizzle-kit`, and provides a type-safe query builder. It has no code-generation step at runtime, no ORM "magic", and its output is plain SQL that is easy to inspect and reason about. The same schema definitions target both SQLite and PostgreSQL, making a future database swap a config-level change.

Alternative considered: Prisma. Rejected because Prisma requires a code-generation step (`prisma generate`) during development, slowing iteration. Its generated client is also a binary that must be rebuilt per platform 鈥?a concern given the Windows/Linux CI matrix.

Alternative considered: Knex.js or raw `better-sqlite3` queries. Rejected because manual SQL query strings lose type safety and require separate TypeScript type definitions that can drift from the schema.

Alternative considered: Kysely. Considered favorably but rejected in favor of Drizzle because Drizzle has a more complete SQLite dialect, first-class migration tooling in `drizzle-kit`, and a larger TypeScript community presence as of early 2026.

### 4. Place storage implementation in a new `packages/storage` package

The SQLite schema, Drizzle instance, migration runner, and repository implementations live in `@senclaw/storage`. This keeps `apps/agent-runner` focused on orchestration logic and makes the storage layer independently testable. The package exports a `createStorage(url)` factory that returns all three repository implementations plus a health-check component.

Alternative considered: embed the storage implementation inside `apps/agent-runner`. Rejected because future services (connector worker, scheduler) will need the same repositories. Centralizing in a package avoids duplication.

Alternative considered: embed in `apps/gateway`. Rejected because the gateway should own routing and composition, not storage.

### 5. Use `better-sqlite3` as the SQLite driver

`better-sqlite3` is a synchronous, high-performance Node.js SQLite binding. Synchronous I/O is acceptable for the current scale and simplifies the repository interface (methods remain synchronous or are trivially awaitable with `Promise.resolve`). It compiles to a native addon 鈥?`node-gyp` is required, but `Visual C++ Build Tools` should be documented in the local setup guide for Windows developers as an explicit prerequisite for native addon compilation.

Alternative considered: `@electric-sql/pglite` (PostgreSQL in WASM). Rejected because it is primarily intended for browser environments and adds unnecessary WASM overhead for a server process.

Alternative considered: `node:sqlite` (Node.js 22.5+ built-in). Considered positively due to zero extra dependency, but the API is still marked experimental as of Node.js 22 LTS. Deferred until it stabilizes.

### 6. Keep in-memory repositories as the default when `SENCLAW_DB_URL` is not set

The gateway startup checks `config.dbUrl`: if absent, it uses the in-memory repositories; if present, it instantiates the SQLite storage and uses those. If the SQLite path is misconfigured or unavailable, startup should fail fast with a clear actionable error.

Alternative considered: always require `SENCLAW_DB_URL` and provide a `:memory:` SQLite URL as the default. Rejected because it changes the behavior of existing unit tests (which construct repositories directly) and introduces a SQLite compilation requirement for all test runs on the CI matrix.

### 7. Run schema migrations at startup

On startup, `@senclaw/storage` runs Drizzle's `migrate()` against the configured database file, applying any pending SQL migrations from the `packages/storage/drizzle` directory. This is idempotent 鈥?already-applied migrations are skipped. It trades a few milliseconds at startup for the guarantee that the schema is always current.

Alternative considered: require an explicit `pnpm db:migrate` command before starting the server. Rejected because it adds a manual step that is easy to forget and breaks the "one command to start" (`pnpm dev`) contract.

Alternative considered: use `db.push()` (schema push without migration files). Rejected for production-readiness reasons: push destroys and recreates tables if the schema changes, which is unacceptable once real data exists.

## Risks / Trade-offs

- [SQLite WAL mode write contention if multiple processes open the same file] 鈫?Mitigation: enable WAL mode in the storage factory (`PRAGMA journal_mode=WAL`) for file-backed SQLite. In-memory mode does not require WAL. In the current single-process model this is not a risk; document the constraint for future multi-process deployment.
- [better-sqlite3 requires native compilation (node-gyp)] 鈫?Mitigation: document the build-tools prerequisite in `docs/development/bootstrap.md` and keep a clear `.env` note where defaults are introduced. Pin the `better-sqlite3` version in the workspace.
- [Drizzle migration files diverge from schema over time] 鈫?Mitigation: always generate migrations via `pnpm db:generate` (wraps `drizzle-kit generate`) rather than editing migration SQL by hand. CI verifies that no un-committed migrations exist.
- [Repository interface additions in @senclaw/protocol add protocol package churn] 鈫?Mitigation: interfaces are stable once extracted. They describe CRUD operations that will not change frequently. If the domain model evolves significantly, a separate change set will handle it.
- [In-memory fallback hides storage bugs until SENCLAW_DB_URL is set] 鈫?Mitigation: the integration test suite includes a storage-specific test that runs against a `:memory:` SQLite URL to verify the SQLite implementations pass the same contract as the in-memory ones.

## Migration Plan

1. Add repository interfaces to `@senclaw/protocol` and update the in-memory classes in `apps/agent-runner` to implement them. No behavior change.
2. Extend `@senclaw/config` with `dbUrl` and update `.env.example` files.
3. Create `packages/storage` with the Drizzle schema, migration files, SQLite repository implementations, and the `createStorage(url)` factory.
4. Update the gateway startup to branch on `config.dbUrl` and instantiate the appropriate repositories.
5. Add a database health-check to `@senclaw/storage` and wire it into the gateway's `/health` endpoint.
6. Add unit tests for the SQLite repositories against `:memory:` SQLite.
7. Add a storage-contract integration test that runs the same CRUD assertions against both the in-memory and SQLite implementations.
8. Verify `pnpm run verify` and `pnpm run test` pass on both Windows and Linux with and without `SENCLAW_DB_URL` set.

Rollback: the in-memory repositories are not removed in this change. Unsetting `SENCLAW_DB_URL` reverts runtime behavior to the previous in-memory model. The `packages/storage` package can be removed without modifying any service logic if the change is reverted.

## Open Questions

- **[Resolve before schema finalization]** Should `Run` store a `completedAt` timestamp in addition to `updatedAt`? The current schema only has `createdAt` and `updatedAt`; a dedicated `completedAt` column would make duration queries easier later.
- **[Resolve before storage package implementation]** Should message content be stored as a single JSON blob column or normalized into typed columns (role, text, tool_call_id)? A JSON blob is simpler now; normalized columns are better for future query patterns (e.g., filtering tool calls by name).





