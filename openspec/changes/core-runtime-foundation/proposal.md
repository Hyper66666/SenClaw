## Why

The Senclaw monorepo has a complete development workflow, CI, and scaffolding, but every service is a stub returning its descriptor as JSON. Before adding product features, the platform needs a working runtime core: shared domain types, real infrastructure packages, an API gateway that routes requests, an agent runner that actually orchestrates LLM calls and tool use, and a tool runner that executes tools. Without this foundation, no user-facing feature can be built.

## What Changes

- Define the core domain model in `@senclaw/protocol`: agents, tasks, runs, messages, tool definitions, tool results, and provider configuration types.
- Implement `@senclaw/config` with typed, validated configuration loading from environment variables and `.env` files.
- Implement `@senclaw/logging` with structured JSON logging (pino), request-scoped context, and cross-service correlation IDs.
- Implement `@senclaw/observability` with basic metrics collection and health-check contracts.
- Replace the gateway stub with a real HTTP API server (Fastify) exposing agent management, task submission, run retrieval, and health-check endpoints.
- Implement the agent runner with a core execution loop: receive a task, load the agent definition, invoke the LLM via the Vercel AI SDK, dispatch tool calls to the tool runner, feed results back, and return the final response.
- Implement the tool runner host with a tool registry, input validation, and in-process execution for built-in tools (file-system sandboxed execution deferred to a later Rust boundary component).
- Use in-memory storage for agent definitions, runs, and messages in this first cut; persistent storage is deferred to a future change.

## Capabilities

### New Capabilities
- `protocol-types`: Core domain model — agent, task, run, message, tool definition, tool result, and provider configuration types shared across all services.
- `shared-infrastructure`: Real implementations of config loading, structured logging, observability metrics, and health-check contracts used by all services.
- `gateway-api`: HTTP API with versioned routes for agent CRUD, task submission, run status retrieval, streaming responses, and health checks.
- `agent-execution`: Agent runtime loop — LLM invocation via the Vercel AI SDK, multi-turn conversation management, tool-call dispatch, and run lifecycle (pending → running → completed / failed).
- `tool-execution`: Tool registry, JSON Schema input validation, in-process tool execution, and a result contract that the agent runner consumes.

### Modified Capabilities
- None.

## Impact

- All four shared packages (`protocol`, `config`, `logging`, `observability`) gain real implementations replacing their current stubs.
- `apps/gateway` becomes a Fastify HTTP server with structured routes instead of a bare `node:http` server.
- `apps/agent-runner` becomes a functional agent orchestration runtime instead of a descriptor endpoint.
- `apps/tool-runner-host` becomes a tool registry and executor instead of a descriptor endpoint.
- Adds external dependencies: `fastify`, `pino`, `@ai-sdk/openai`, `ai` (Vercel AI SDK), `zod`, `dotenv`.
- `apps/web`, `apps/connector-worker`, and `apps/scheduler` remain stubs in this change — they are not part of the core runtime loop.
- In-memory storage means all state is lost on restart; this is intentional for the first cut and will be addressed in a future persistent-storage change.
