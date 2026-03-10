## ADDED Requirements

### Requirement: IAgentRepository interface
`@senclaw/protocol` SHALL export an `IAgentRepository` interface that declares the full CRUD surface for agent definitions.

#### Scenario: Interface defines create operation
- **WHEN** a class implements `IAgentRepository`
- **THEN** it must provide a `create(data: CreateAgent): Promise<Agent>` method that accepts a `CreateAgent` payload and returns the persisted `Agent` with a server-generated `id`

#### Scenario: Interface defines read operations
- **WHEN** a class implements `IAgentRepository`
- **THEN** it must provide `get(id: string): Promise<Agent | undefined>` and `list(): Promise<Agent[]>` methods

#### Scenario: Interface defines delete operation
- **WHEN** a class implements `IAgentRepository`
- **THEN** it must provide `delete(id: string): Promise<boolean>` returning `true` if the agent existed and was removed, `false` if it did not exist

### Requirement: IRunRepository interface
`@senclaw/protocol` SHALL export an `IRunRepository` interface that declares the full lifecycle surface for runs.

#### Scenario: Interface defines create operation
- **WHEN** a class implements `IRunRepository`
- **THEN** it must provide `create(agentId: string, input: string): Promise<Run>` returning a new run in `pending` status with a server-generated `id` and current timestamps

#### Scenario: Interface defines status-update operation
- **WHEN** a class implements `IRunRepository`
- **THEN** it must provide `updateStatus(id: string, status: RunStatus, error?: string): Promise<Run | undefined>` that updates the run's status, sets `updatedAt` to the current time, and optionally records an error message

#### Scenario: Interface defines read operations
- **WHEN** a class implements `IRunRepository`
- **THEN** it must provide `get(id: string): Promise<Run | undefined>` and `list(): Promise<Run[]>` methods

### Requirement: IMessageRepository interface
`@senclaw/protocol` SHALL export an `IMessageRepository` interface that declares the append-and-read surface for conversation messages.

#### Scenario: Interface defines append operation
- **WHEN** a class implements `IMessageRepository`
- **THEN** it must provide `append(runId: string, message: Message): Promise<void>` that adds the message to the ordered history for the given run

#### Scenario: Interface defines list operation
- **WHEN** a class implements `IMessageRepository`
- **THEN** it must provide `listByRunId(runId: string): Promise<Message[]>` returning all messages for the run in insertion order

### Requirement: In-memory classes implement the interfaces
The existing repository classes in `apps/agent-runner` SHALL be renamed to `InMemoryAgentRepository`, `InMemoryRunRepository`, and `InMemoryMessageRepository`, and SHALL explicitly implement their respective interfaces.

#### Scenario: In-memory repository satisfies interface contract
- **WHEN** the TypeScript compiler type-checks `apps/agent-runner`
- **THEN** it accepts `InMemoryAgentRepository` wherever `IAgentRepository` is required, with no type errors

#### Scenario: Service layer uses interface types, not concrete classes
- **WHEN** `AgentService` and `executeRun` are updated to accept interface parameters
- **THEN** passing either an in-memory or a SQLite implementation at runtime compiles and behaves correctly

### Requirement: Interfaces are importable from `@senclaw/protocol`
`@senclaw/protocol` SHALL re-export `IAgentRepository`, `IRunRepository`, and `IMessageRepository` from its entry point alongside the existing domain type exports.

#### Scenario: Consumers import interfaces from the protocol package
- **WHEN** a package writes `import type { IAgentRepository } from "@senclaw/protocol"`
- **THEN** the TypeScript compiler resolves the import without error


