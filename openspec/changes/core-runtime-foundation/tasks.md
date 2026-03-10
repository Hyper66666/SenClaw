## 1. Protocol Types

- [x] 1.1 Add `zod` as a workspace dependency and configure it in `@senclaw/protocol`.
- [x] 1.2 Implement the provider configuration schema (`ProviderConfigSchema`) with provider identifier, model name, and optional parameters (temperature, maxTokens).
- [x] 1.3 Implement the agent definition schema (`AgentSchema`) with id, name, system prompt, provider config, and tool name list.
- [x] 1.4 Implement the task schema (`TaskSchema`) with agent ID and input message.
- [x] 1.5 Implement the run schema (`RunSchema`) with run ID, task reference, status enum (`pending`, `running`, `completed`, `failed`), timestamps, and optional error.
- [x] 1.6 Implement the message schema (`MessageSchema`) supporting `system`, `user`, `assistant`, and `tool` roles with content and optional tool-call metadata.
- [x] 1.7 Implement the tool definition schema (`ToolDefinitionSchema`) with name, description, and Zod input schema.
- [x] 1.8 Implement the tool result schema (`ToolResultSchema`) with tool call ID, success flag, and content or error.
- [x] 1.9 Re-export all schemas and inferred types from `@senclaw/protocol` entry point and add unit tests.

## 2. Shared Infrastructure — Config

- [x] 2.1 Add `dotenv` as a dependency of `@senclaw/config`.
- [x] 2.2 Implement `loadConfig()` with Zod-validated environment variable loading, `.env` file fallback, and descriptive error messages for missing or invalid values.
- [x] 2.3 Define the base configuration schema covering `logLevel`, `gatewayPort`, `agentRunnerPort`, `toolRunnerPort`, `maxTurns`, `llmTimeoutMs`, `toolTimeoutMs`.
- [x] 2.4 Add unit tests for config loading: valid env, missing required var, .env fallback.

## 3. Shared Infrastructure — Logging

- [x] 3.1 Add `pino` as a dependency of `@senclaw/logging`.
- [x] 3.2 Implement `createLogger(serviceName)` returning a pino instance with JSON output, configurable log level, and `service` default field.
- [x] 3.3 Implement `AsyncLocalStorage`-based correlation ID propagation with `withCorrelationId(id, fn)` and `getCorrelationId()` helpers.
- [x] 3.4 Integrate correlation ID into child logger creation so all log lines within a request include `correlationId`.
- [x] 3.5 Add unit tests for logger creation, log level filtering, and correlation ID propagation.

## 4. Shared Infrastructure — Observability

- [x] 4.1 Define the `HealthCheck` interface (`status`, optional `detail`) and export from `@senclaw/observability`.
- [x] 4.2 Implement an in-memory `Metrics` class with `increment(name, labels)` and `observe(name, value, labels)` methods.
- [x] 4.3 Add unit tests for health-check contract and metrics collection.

## 5. Tool Runner Host

- [x] 5.1 Implement `ToolRegistry` class: `register(tool)`, `listTools()`, `getTool(name)`, and duplicate-name rejection.
- [x] 5.2 Implement `executeTool(toolCallId, toolName, args)`: validate args against the tool's Zod input schema, invoke the handler, catch exceptions, and return a `ToolResult`.
- [x] 5.3 Implement per-tool execution timeout with configurable duration from `@senclaw/config`.
- [x] 5.4 Implement `exportForAISdk()` to convert registered tools into the Vercel AI SDK `tools` format.
- [x] 5.5 Register the built-in `echo` tool for testing.
- [x] 5.6 Add unit tests for registration, validation, execution, timeout, and AI SDK export.

## 6. Agent Runner

- [x] 6.1 Add `ai` (Vercel AI SDK) and `@ai-sdk/openai` as dependencies of `@senclaw/agent-runner`.
- [x] 6.2 Implement in-memory `AgentRepository` with create, get, list, and delete operations.
- [x] 6.3 Implement in-memory `RunRepository` with create, get, update status, and list operations.
- [x] 6.4 Implement in-memory `MessageRepository` with append and list-by-run-ID operations.
- [x] 6.5 Implement the `ModelProvider` wrapper that resolves a `ProviderConfig` to a Vercel AI SDK language model instance.
- [x] 6.6 Implement the agent execution loop: create run → set running → build message history → call LLM → if tool calls, dispatch to tool registry and loop → if final text, set completed → on error, set failed.
- [x] 6.7 Implement maximum turn limit enforcement with configurable `SENCLAW_MAX_TURNS`.
- [x] 6.8 Implement per-LLM-call timeout with configurable `SENCLAW_LLM_TIMEOUT_MS`.
- [x] 6.9 Implement parallel tool-call dispatch (when the LLM returns multiple tool calls in one turn, execute them concurrently).
- [x] 6.10 Expose `AgentService` facade with `createAgent`, `getAgent`, `listAgents`, `deleteAgent`, `submitTask`, `getRun`, `getRunMessages` methods.
- [x] 6.11 Add unit tests for repository operations, execution loop (mock LLM), turn limit, timeout, and parallel tool dispatch.

## 7. Gateway API

- [x] 7.1 Add `fastify` as a dependency of `@senclaw/gateway`.
- [x] 7.2 Implement Fastify server bootstrap with pino logger integration and config-driven port.
- [x] 7.3 Implement correlation ID request hook: read or generate `x-correlation-id`, set it in `AsyncLocalStorage`, and return it in the response header.
- [x] 7.4 Implement the error handler plugin: consistent JSON error format with `error` code and `message` fields; map Zod validation errors to `400 VALIDATION_ERROR`.
- [x] 7.5 Implement `/api/v1/agents` routes: POST (create), GET (list), GET `/:id`, DELETE `/:id`.
- [x] 7.6 Implement `/api/v1/tasks` route: POST (submit task, return run).
- [x] 7.7 Implement `/api/v1/runs` routes: GET `/:id` (run status), GET `/:id/messages` (message history).
- [x] 7.8 Implement `GET /health` endpoint using the observability health-check interface.
- [x] 7.9 Wire in-process composition: gateway startup creates the tool registry, agent service, and repositories, then registers routes.
- [x] 7.10 Add unit tests for route handlers (mock agent service) and integration tests for the end-to-end flow.

## 8. Integration and Verification

- [x] 8.1 Add an integration test that creates an agent, submits a task, and verifies the run completes with messages (using a mock LLM provider).
- [x] 8.2 Add an integration test that verifies the tool-call loop: agent with echo tool, LLM mock returns tool call, tool executes, LLM mock returns final text.
- [x] 8.3 Verify `pnpm run verify` and `pnpm run test` pass on both Windows and Linux.
- [x] 8.4 Update the root `package.json` `dev` script to start the gateway (which composes all services in-process).
