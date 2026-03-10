## ADDED Requirements

### Requirement: SENCLAW_DB_URL configuration field
`@senclaw/config` SHALL include an optional `dbUrl` field mapped to the `SENCLAW_DB_URL` environment variable. When the variable is absent, `dbUrl` SHALL default to `undefined`, preserving the zero-dependency in-memory startup path.

#### Scenario: DB URL is read from environment
- **WHEN** `SENCLAW_DB_URL=file:./senclaw.db` is set in the environment
- **THEN** `loadConfig()` returns a config with `dbUrl: "file:./senclaw.db"`

#### Scenario: DB URL is absent
- **WHEN** `SENCLAW_DB_URL` is not set and is not present in `.env`
- **THEN** `loadConfig()` returns a config with `dbUrl: undefined`, and no validation error is raised

#### Scenario: Empty string is treated as absent
- **WHEN** `SENCLAW_DB_URL=""` is set in the environment
- **THEN** `loadConfig()` returns a config with `dbUrl: undefined` rather than an empty string

### Requirement: Platform-aware default documented in env example files
The `.env.example`, `.env.windows.example`, and `.env.linux.example` files SHALL document the `SENCLAW_DB_URL` variable with a commented-out default value appropriate for each platform.

#### Scenario: Linux example shows forward-slash path
- **WHEN** a developer opens `.env.linux.example`
- **THEN** the file contains a commented entry `# SENCLAW_DB_URL=file:./senclaw.db`

#### Scenario: Windows example shows equivalent path
- **WHEN** a developer opens `.env.windows.example`
- **THEN** the file contains a commented entry `# SENCLAW_DB_URL=file:./senclaw.db` (SQLite file paths are platform-normalized by the driver)

### Requirement: Database health-check component
`@senclaw/storage` SHALL export a `DatabaseHealthCheck` class that implements the `HealthCheck` interface from `@senclaw/observability`. The check SHALL execute a trivial query against the configured database to verify connectivity.

#### Scenario: Healthy database returns healthy status
- **WHEN** `DatabaseHealthCheck.check()` is called and the database file is accessible
- **THEN** it returns `{ status: "healthy" }`

#### Scenario: Inaccessible database returns unhealthy status
- **WHEN** `DatabaseHealthCheck.check()` is called and the database cannot be opened (e.g., invalid path, permissions error)
- **THEN** it returns `{ status: "unhealthy", detail: "<error message>" }` without throwing

### Requirement: Gateway health endpoint reflects storage status
The gateway SHALL include the `DatabaseHealthCheck` in its aggregated health response when SQLite storage is active.

#### Scenario: Health check includes storage component
- **WHEN** `GET /health` is called and `SENCLAW_DB_URL` is set
- **THEN** the response includes a `storage` key in the `details` object reflecting the database health status

#### Scenario: Health check omits storage component in in-memory mode
- **WHEN** `GET /health` is called and `SENCLAW_DB_URL` is not set
- **THEN** the response returns `{ "status": "healthy" }` with no `storage` detail, matching pre-existing behavior


### Requirement: Invalid DB URL handling
@senclaw/config can store invalid values, but startup must fail-fast when SENCLAW_DB_URL is non-empty and storage initialization fails.

#### Scenario: In-memory startup remains possible when no URL is set
- **WHEN** SENCLAW_DB_URL is missing or whitespace only
- **THEN** dbUrl resolves to undefined and loadConfig() succeeds

#### Scenario: Misconfigured URL does not silently enable fallback
- **WHEN** SENCLAW_DB_URL is invalid and gateway creation runs in SQLite mode
- **THEN** startup returns an explicit error, and the operator must fix the storage configuration before proceeding

