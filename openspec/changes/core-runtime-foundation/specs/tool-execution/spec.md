## ADDED Requirements

### Requirement: Tool registration
The tool runner host SHALL provide a `ToolRegistry` that allows registering tool definitions at startup. Each tool definition includes a unique name, a description, a Zod input schema, and a handler function.

#### Scenario: Register a tool
- **WHEN** a service registers a tool named `get_current_time` with a description, input schema, and handler
- **THEN** the registry accepts the registration and the tool is available for execution

#### Scenario: Duplicate tool name is rejected
- **WHEN** a service attempts to register two tools with the same name
- **THEN** the registry throws an error indicating the name is already registered

#### Scenario: List registered tools
- **WHEN** a consumer calls `registry.listTools()`
- **THEN** it returns an array of tool definitions (name, description, JSON Schema of input) for all registered tools

### Requirement: Tool input validation
The tool runner host SHALL validate tool call arguments against the tool's Zod input schema before executing the handler.

#### Scenario: Valid input passes validation
- **WHEN** a tool call provides arguments that match the tool's input schema
- **THEN** the handler is invoked with the validated, typed arguments

#### Scenario: Invalid input is rejected without calling the handler
- **WHEN** a tool call provides arguments that do not match the input schema (e.g., missing required field, wrong type)
- **THEN** the tool runner returns a `ToolResult` with `success: false` and an error message describing the validation failure
- **AND** the handler function is NOT invoked

### Requirement: Tool execution and result contract
The tool runner host SHALL execute the tool handler and return a `ToolResult` as defined in `@senclaw/protocol`. The result SHALL include the tool call identifier, a success/failure indicator, and the result content or error message.

#### Scenario: Successful tool execution
- **WHEN** a tool handler executes successfully and returns a string result
- **THEN** the tool runner returns `{ toolCallId, success: true, content: "<result>" }`

#### Scenario: Handler throws an exception
- **WHEN** a tool handler throws an error during execution
- **THEN** the tool runner catches the error and returns `{ toolCallId, success: false, error: "<error message>" }`
- **AND** the error does not propagate to the caller

### Requirement: Tool definition export for LLM consumption
The tool runner host SHALL provide a method to export registered tool definitions in a format compatible with the Vercel AI SDK's `tools` parameter, so the agent runner can pass them directly to the LLM invocation.

#### Scenario: Export tools for AI SDK
- **WHEN** the agent runner calls `registry.exportForAISdk()`
- **THEN** the result is an object mapping tool names to `{ description, parameters }` entries compatible with the Vercel AI SDK `tool()` helper

### Requirement: Built-in echo tool for testing
The tool runner host SHALL include a built-in `echo` tool that returns its input as-is. This tool exists for integration testing and validation of the end-to-end tool-call flow.

#### Scenario: Echo tool returns input
- **WHEN** the `echo` tool is called with `{ "message": "hello" }`
- **THEN** it returns a successful `ToolResult` with content `"hello"`

### Requirement: Tool execution timeout
The tool runner host SHALL enforce a configurable per-tool execution timeout. If a handler exceeds the timeout, the execution SHALL be aborted and a failure result returned.

#### Scenario: Tool handler times out
- **WHEN** a tool handler does not return within the configured timeout
- **THEN** the tool runner returns `{ toolCallId, success: false, error: "Tool execution timed out" }`
