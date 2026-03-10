## ADDED Requirements

### Requirement: Drizzle schema for agents table
`@senclaw/storage` SHALL define a Drizzle ORM schema for the `agents` table that maps to the `Agent` domain type.

#### Scenario: Agent record persists all required fields
- **WHEN** an agent with `id`, `name`, `systemPrompt`, `provider` (JSON), and `tools` (JSON array) is written
- **THEN** all fields are stored and can be retrieved without data loss or type coercion errors

#### Scenario: Provider config is stored as JSON
- **WHEN** an agent with `provider: { provider: "openai", model: "gpt-4o", temperature: 0.7 }` is persisted
- **THEN** the `provider` column stores the value as a JSON string and deserializes back to the same object on read

### Requirement: Drizzle schema for runs table
`@senclaw/storage` SHALL define a Drizzle ORM schema for the `runs` table that maps to the `Run` domain type and includes deterministic ordering fields for `list()` consumers.

#### Scenario: Run record persists lifecycle fields
- **WHEN** a run with `id`, `agentId`, `input`, `status`, `createdAt`, `updatedAt`, and optional `error` is written
- **THEN** all fields are stored and retrievable

#### Scenario: Run status update is atomic
- **WHEN** `updateStatus(id, "completed")` is called
- **THEN** only `status` and `updatedAt` are modified; all other fields remain unchanged

### Requirement: Drizzle schema for messages table
`@senclaw/storage` SHALL define a Drizzle ORM schema for the `messages` table that maps to the `Message` domain type.

#### Scenario: Message record stores role and content
- **WHEN** a message with role `user` and string content is appended
- **THEN** the record stores `runId`, `role`, `content`, and `insertedAt` (insertion order key)

#### Scenario: Tool-call metadata is stored as JSON
- **WHEN** an `assistant` message with a `toolCalls` array is appended
- **THEN** the `toolCalls` column stores the array as a JSON string and deserializes correctly on read

#### Scenario: Messages are returned in insertion order
- **WHEN** `listByRunId(runId)` is called after appending system, user, and assistant messages in that order
- **THEN** the returned array has the same order as insertion, determined by an auto-incrementing `seq` column

### Requirement: createStorage factory
`@senclaw/storage` SHALL export a `createStorage(url: string)` factory function that opens a Drizzle SQLite database at the given URL, runs pending migrations, enables WAL mode for file-backed DBs, and returns an object containing `agents`, `runs`, `messages` (repository implementations) and `healthCheck` (a `DatabaseHealthCheck` instance).

#### Scenario: Storage factory opens database and runs migrations
- **WHEN** `createStorage("file:./test.db")` is called
- **THEN** the database file is created if absent, migrations are applied, and the returned repositories are ready to use

#### Scenario: In-memory SQLite is supported for tests
- **WHEN** `createStorage(":memory:")` is called
- **THEN** an in-memory SQLite database is opened, migrations are applied, and the repositories function identically to the file-backed variant

#### Scenario: Storage factory enables WAL journal mode
- **WHEN** `createStorage` opens a new database
- **THEN** `PRAGMA journal_mode=WAL` is set before returning for file-backed DBs, as verified by `PRAGMA journal_mode` returning `"wal"`; this check is not enforced for `:memory:` mode.

### Requirement: SqliteAgentRepository implements IAgentRepository
The `SqliteAgentRepository` class SHALL implement `IAgentRepository` using Drizzle queries against the `agents` table.

#### Scenario: Create and retrieve an agent
- **WHEN** `create({ name: "test", systemPrompt: "...", provider: {...}, tools: [] })` is called
- **THEN** a row is inserted, the returned `Agent` has a server-generated UUID `id`, and `get(id)` returns the same agent

#### Scenario: List returns all agents
- **WHEN** three agents have been created and `list()` is called
- **THEN** the returned array contains exactly three agents in ascending `created_at` order

#### Scenario: Delete returns false for missing agent
- **WHEN** `delete("non-existent-id")` is called
- **THEN** `false` is returned and no database error is thrown

### Requirement: SqliteRunRepository implements IRunRepository
The `SqliteRunRepository` class SHALL implement `IRunRepository` using Drizzle queries against the `runs` table and must return runs in deterministic order (`created_at` descending for active run queues, `created_at` ascending for archive views); tests cover both explicit order requirements.

#### Scenario: Create run starts in pending status
- **WHEN** `create(agentId, "hello")` is called
- **THEN** the returned run has `status: "pending"`, non-null `createdAt` and `updatedAt`, and a UUID `id`

#### Scenario: updateStatus transitions run to completed
- **WHEN** `updateStatus(runId, "completed")` is called on an existing run
- **THEN** `get(runId)` returns a run with `status: "completed"` and an updated `updatedAt` timestamp

#### Scenario: updateStatus records error on failure
- **WHEN** `updateStatus(runId, "failed", "LLM timeout")` is called
- **THEN** `get(runId)` returns a run with `status: "failed"` and `error: "LLM timeout"`

#### Scenario: Get returns undefined for missing run
- **WHEN** `get("non-existent-id")` is called
- **THEN** `undefined` is returned without throwing

### Requirement: SqliteMessageRepository implements IMessageRepository
The `SqliteMessageRepository` class SHALL implement `IMessageRepository` using Drizzle queries against the `messages` table.

#### Scenario: Messages are stored and retrieved in order
- **WHEN** three messages are appended for the same `runId` and `listByRunId(runId)` is called
- **THEN** the returned array contains exactly three messages in insertion order

#### Scenario: listByRunId returns empty array for unknown run
- **WHEN** `listByRunId("no-such-run")` is called
- **THEN** an empty array is returned without throwing

### Requirement: Storage package is independently testable
The `@senclaw/storage` package SHALL have its own unit test suite that exercises all repository methods against an in-memory SQLite database (`:memory:`) without starting the gateway or agent runner.

#### Scenario: Tests run without SENCLAW_DB_URL
- **WHEN** the test suite runs without any environment variable set
- **THEN** all storage tests pass using `:memory:` directly, with no file system side effects

### Requirement: Storage-contract integration test
The integration test suite SHALL include a contract test that runs the same CRUD scenarios against both `InMemory*` and `Sqlite*` implementations to verify behavioral equivalence.

#### Scenario: Both implementations pass the same contract assertions
- **WHEN** the contract test suite runs the create/get/list/delete cycle against `InMemoryAgentRepository` and `SqliteAgentRepository`
- **THEN** both implementations produce identical outcomes for every assertion




