## ADDED Requirements

### Requirement: Agent definition schema
The protocol package SHALL export a Zod schema and inferred TypeScript type for agent definitions, including an identifier, display name, system prompt, model provider configuration, and a list of available tool names.

#### Scenario: Valid agent definition is parsed
- **WHEN** a consumer passes a valid agent definition object to the agent schema
- **THEN** the parse succeeds and returns a typed `Agent` object with all required fields

#### Scenario: Agent definition with missing required fields is rejected
- **WHEN** a consumer passes an object missing the `systemPrompt` or `provider` field
- **THEN** the Zod parse throws a validation error identifying the missing field

### Requirement: Provider configuration schema
The protocol package SHALL export a Zod schema for LLM provider configuration, including the provider identifier (e.g., `openai`), model name, and optional parameters (temperature, maxTokens).

#### Scenario: Provider config with defaults is valid
- **WHEN** a consumer creates a provider config specifying only `provider` and `model`
- **THEN** the parse succeeds and optional parameters are undefined or use documented defaults

#### Scenario: Unknown provider identifier is accepted
- **WHEN** a consumer creates a provider config with a provider identifier not in the built-in list
- **THEN** the parse succeeds because the provider field is a string, not a closed enum — extensibility is preserved

### Requirement: Task schema
The protocol package SHALL export a Zod schema for task submission, including the target agent identifier and an initial user message.

#### Scenario: Valid task is parsed
- **WHEN** a consumer creates a task with `agentId` and `input` message content
- **THEN** the parse succeeds and returns a typed `Task` object

#### Scenario: Task without agent ID is rejected
- **WHEN** a consumer creates a task without specifying `agentId`
- **THEN** the Zod parse throws a validation error

### Requirement: Run schema
The protocol package SHALL export a Zod schema for run state, including a unique run identifier, the originating task, current status (`pending`, `running`, `completed`, `failed`), creation and update timestamps, and an optional error field.

#### Scenario: Run status transitions are representable
- **WHEN** a service creates a run with status `pending` and later updates it to `running`, then to `completed`
- **THEN** each status value is accepted by the schema

#### Scenario: Failed run includes error information
- **WHEN** a run transitions to `failed`
- **THEN** the `error` field contains a string describing the failure reason

### Requirement: Message schema
The protocol package SHALL export a Zod schema for conversation messages, supporting roles `system`, `user`, `assistant`, and `tool`, with content and optional tool-call metadata.

#### Scenario: User message is parsed
- **WHEN** a consumer creates a message with role `user` and string content
- **THEN** the parse succeeds

#### Scenario: Assistant message with tool calls is parsed
- **WHEN** a consumer creates a message with role `assistant` containing an array of tool-call objects (each with `toolCallId`, `toolName`, and `args`)
- **THEN** the parse succeeds and the tool-call array is accessible on the typed result

#### Scenario: Tool result message is parsed
- **WHEN** a consumer creates a message with role `tool` containing `toolCallId` and `result`
- **THEN** the parse succeeds

### Requirement: Tool definition schema
The protocol package SHALL export a Zod schema for tool definitions, including a unique tool name, a human-readable description, and a Zod schema (or JSON Schema) describing the tool's expected input parameters.

#### Scenario: Tool definition with Zod input schema is valid
- **WHEN** a consumer defines a tool with `name`, `description`, and a Zod object as `inputSchema`
- **THEN** the definition is accepted and the input schema can be converted to JSON Schema for LLM consumption

### Requirement: Tool result schema
The protocol package SHALL export a Zod schema for tool execution results, including the tool call identifier, a success/failure indicator, and the result content or error message.

#### Scenario: Successful tool result is parsed
- **WHEN** a tool execution returns `success: true` and a string `content`
- **THEN** the parse succeeds

#### Scenario: Failed tool result includes error detail
- **WHEN** a tool execution returns `success: false` and an `error` string
- **THEN** the parse succeeds and the error is accessible

### Requirement: Domain types are importable from a single entry point
The `@senclaw/protocol` package SHALL re-export all schemas and inferred types from `src/index.ts` so consumers can import via `import { AgentSchema, type Agent } from "@senclaw/protocol"`.

#### Scenario: All domain types are accessible from the package root
- **WHEN** a consuming package imports from `@senclaw/protocol`
- **THEN** it can access `AgentSchema`, `Agent`, `ProviderConfigSchema`, `ProviderConfig`, `TaskSchema`, `Task`, `RunSchema`, `Run`, `RunStatus`, `MessageSchema`, `Message`, `ToolDefinitionSchema`, `ToolDefinition`, `ToolResultSchema`, and `ToolResult`
