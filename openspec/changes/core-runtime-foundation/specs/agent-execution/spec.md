## ADDED Requirements

### Requirement: Run lifecycle management
The agent runner SHALL manage run lifecycle through the states `pending` → `running` → `completed` | `failed`. Each state transition SHALL update the run's `updatedAt` timestamp.

#### Scenario: New run starts in pending
- **WHEN** the agent runner receives a task
- **THEN** it creates a run with `status: "pending"` and a unique `runId`

#### Scenario: Run transitions to running
- **WHEN** the agent runner begins executing a pending run
- **THEN** the run status changes to `running` and `updatedAt` is updated

#### Scenario: Run completes successfully
- **WHEN** the LLM produces a final response without further tool calls
- **THEN** the run status changes to `completed`, the assistant's final message is appended, and `updatedAt` is updated

#### Scenario: Run fails with error
- **WHEN** the LLM call throws an exception or the run exceeds the maximum turn count
- **THEN** the run status changes to `failed`, the `error` field is set with a description, and `updatedAt` is updated

### Requirement: LLM invocation via provider abstraction
The agent runner SHALL invoke the LLM through the Vercel AI SDK, using the provider and model specified in the agent definition. The invocation SHALL include the agent's system prompt, the conversation history, and the available tool definitions.

#### Scenario: LLM is called with correct context
- **WHEN** the agent runner executes a run for an agent with `provider: { provider: "openai", model: "gpt-4o" }` and `systemPrompt: "You are helpful"`
- **THEN** the LLM call includes the system prompt as the first message, followed by the conversation history, and the tool definitions in the provider's expected format

#### Scenario: LLM provider is resolved from agent config
- **WHEN** the agent definition specifies `provider: { provider: "openai", model: "gpt-4o-mini" }`
- **THEN** the agent runner uses the `@ai-sdk/openai` provider adapter with the specified model

### Requirement: Tool-call dispatch loop
The agent runner SHALL implement a loop that dispatches tool calls requested by the LLM to the tool runner, collects results, and feeds them back to the LLM until it produces a final text response.

#### Scenario: Single tool call in one turn
- **WHEN** the LLM responds with a single tool call for tool `get_weather` with args `{ "city": "Beijing" }`
- **THEN** the agent runner dispatches the call to the tool registry, receives the result, appends both the tool-call message and tool-result message to the history, and calls the LLM again

#### Scenario: Multiple tool calls in one turn
- **WHEN** the LLM responds with two tool calls in a single response
- **THEN** the agent runner dispatches both calls, collects both results, and feeds them all back to the LLM in one follow-up turn

#### Scenario: Tool call followed by final response
- **WHEN** the LLM responds with a tool call on turn 1 and a text response on turn 2
- **THEN** the run completes with the final text response and the message history contains: system, user, assistant(tool-call), tool(result), assistant(text)

### Requirement: Maximum turn limit
The agent runner SHALL enforce a configurable maximum number of LLM invocation turns per run. If the limit is reached without a final response, the run SHALL fail.

#### Scenario: Turn limit prevents infinite loops
- **WHEN** the LLM continuously returns tool calls without ever producing a final text response
- **THEN** the agent runner stops after the configured maximum turns and sets the run status to `failed` with error `"Maximum turn limit exceeded"`

#### Scenario: Turn limit is configurable
- **WHEN** the configuration sets `SENCLAW_MAX_TURNS=5`
- **THEN** the agent runner allows at most 5 LLM invocations per run

### Requirement: LLM call timeout
The agent runner SHALL enforce a configurable timeout for each individual LLM invocation. If the timeout is exceeded, the invocation SHALL be aborted and the run SHALL fail.

#### Scenario: LLM call times out
- **WHEN** an LLM invocation does not respond within the configured timeout
- **THEN** the call is aborted and the run transitions to `failed` with an error indicating timeout

### Requirement: Message history persistence
The agent runner SHALL append each message (system, user, assistant, tool) to the run's message history in order. The complete history SHALL be retrievable by run ID.

#### Scenario: Messages are recorded in order
- **WHEN** a run completes with a system prompt, user input, assistant tool call, tool result, and assistant final response
- **THEN** retrieving messages by run ID returns all five messages in chronological order

#### Scenario: Failed run preserves partial history
- **WHEN** a run fails after two LLM turns
- **THEN** the message history contains all messages up to the point of failure
