## Context

Senclaw's monorepo contains six service apps and four shared packages, all of which are currently stubs. The development workflow, CI, testing infrastructure, and toolchain are locked. This design covers the first real implementation: turning stubs into a working runtime core that can accept a user task, run an agent against an LLM, dispatch tool calls, and return a result.

The primary constraint is speed of iteration: the domain model is still evolving, so the design must be easy to extend. Persistent storage, authentication, rate limiting, and multi-tenancy are explicitly deferred. The three services not on the critical path — web console, connector worker, and scheduler — remain stubs.

## Goals / Non-Goals

**Goals:**
- Define a shared domain model that all services import from `@senclaw/protocol`.
- Deliver working implementations of config, logging, and observability packages.
- Stand up a real HTTP API in the gateway with versioned routes.
- Implement an agent execution loop that calls an LLM, handles tool-use turns, and manages run lifecycle.
- Implement a tool registry and executor with JSON Schema validation.
- Keep all state in memory so the system starts instantly with zero external dependencies.
- Ensure the end-to-end flow is testable: submit a task → agent runs → tools execute → result returned.

**Non-Goals:**
- Persistent storage (PostgreSQL, Redis, or file-based).
- Authentication, authorization, or API key management.
- Streaming responses to the client (internal streaming from the LLM is allowed but the gateway returns complete responses in this cut).
- Web console, connector workers, or scheduler implementation.
- Multi-model orchestration (one LLM provider per agent in v1).
- Production-grade process isolation for tool execution (deferred to a Rust boundary component).

## Decisions

### 1. Use Zod as the single schema and validation layer

All domain types in `@senclaw/protocol` are defined as Zod schemas with inferred TypeScript types. This gives runtime validation at service boundaries, JSON Schema generation for tool input contracts, and a single source of truth that prevents type/schema drift.

Alternative considered: define TypeScript interfaces manually and validate with `ajv`. Rejected because maintaining separate interfaces and JSON Schemas doubles the surface area and is error-prone during early iteration.

### 2. Use Fastify as the gateway HTTP framework

Fastify provides schema-based request/response validation, structured logging integration (pino-native), a plugin architecture for cross-cutting concerns, and strong TypeScript support. The gateway registers versioned route plugins (e.g., `/api/v1/agents`, `/api/v1/tasks`).

Alternative considered: Express. Rejected because Express lacks built-in schema validation, has weaker TypeScript ergonomics, and its middleware model encourages ad hoc patterns that are harder to test.

Alternative considered: Hono. Rejected because Fastify has a larger ecosystem for server-side Node.js, better pino integration, and more mature plugin lifecycle management.

### 3. Use pino for structured logging across all services

`@senclaw/logging` wraps pino with Senclaw defaults: JSON output, configurable log level via `SENCLAW_LOG_LEVEL`, automatic correlation-ID propagation via `AsyncLocalStorage`, and child-logger creation per request. All services import the logger from this package.

Alternative considered: winston. Rejected because pino has lower overhead, native JSON output, and first-class Fastify integration.

### 4. Use the Vercel AI SDK for LLM interaction

The agent runner uses the `ai` package (Vercel AI SDK) with provider adapters (e.g., `@ai-sdk/openai`) to call LLMs. The SDK handles message formatting, tool-call parsing, streaming, and multi-turn conversations with a unified interface across providers.

Alternative considered: call OpenAI/Anthropic APIs directly. Rejected because the Vercel AI SDK abstracts provider differences, handles tool-call protocol automatically, and reduces boilerplate for multi-turn execution loops.

Alternative considered: LangChain. Rejected because LangChain's abstraction layer is heavier than needed for direct LLM orchestration, and the Vercel AI SDK is a better fit for TypeScript-first projects with simpler agent patterns.

### 5. Design the agent execution loop as a state machine

A run progresses through explicit states: `pending` → `running` → `completed` | `failed`. Within the `running` state, the loop iterates: call LLM → if tool calls, dispatch them and feed results back → repeat until the LLM produces a final response or the run hits a turn limit. Each iteration appends messages to the run's message history.

Alternative considered: recursive function calls. Rejected because explicit state transitions are easier to debug, log, and extend with hooks (e.g., message middleware, cost tracking) later.

### 6. Decouple tool execution behind a registry interface

`@senclaw/tool-runner-host` exposes a `ToolRegistry` that maps tool names to handler functions. Each tool declares its name, description, and Zod input schema. The agent runner calls the registry over an in-process interface in this first cut. The interface is designed so it can later be replaced with an IPC or HTTP boundary when the tool runner moves to a separate process or Rust sandbox.

Alternative considered: inline tool execution inside the agent runner. Rejected because it violates the service boundary principle and makes it impossible to sandbox or isolate tools later without a major refactor.

### 7. Use in-memory stores with a repository interface

Agent definitions, runs, and messages are stored in `Map`-based in-memory repositories. Each repository implements a typed interface (e.g., `AgentRepository`, `RunRepository`) so the storage backend can be swapped to PostgreSQL or another persistent store in a future change without modifying service logic.

Alternative considered: start with SQLite or file-based storage. Rejected because it adds an external dependency, file-locking concerns on Windows, and migration complexity before the schema stabilizes.

### 8. Inter-service communication is in-process for this cut

The gateway, agent runner, and tool runner host run in the same Node.js process during local development. The gateway imports the agent runner's service layer directly, and the agent runner imports the tool registry directly. Service boundaries are enforced at the TypeScript package level, not at the network level. This allows a single `pnpm run dev` to start the entire stack.

Alternative considered: HTTP-based inter-service calls from day one. Rejected because network overhead, port management, and distributed error handling add complexity that is not justified while there is only one developer and no production deployment.

### 9. Define a provider-configuration model that supports multiple LLM backends

Agent definitions include a `provider` field specifying the LLM provider (e.g., `openai`, `anthropic`), model name, and optional parameters (temperature, max tokens). The agent runner resolves the provider at execution time using a provider-registry pattern. In this first cut, only OpenAI-compatible providers are implemented; the interface supports adding Anthropic, Google, and others later.

Alternative considered: hard-code OpenAI as the only provider. Rejected because the Vercel AI SDK already supports multiple providers at near-zero cost, and locking to a single provider in the domain model would require a breaking change later.

### 10. Gateway API is versioned under `/api/v1`

All routes live under `/api/v1/` to allow future breaking changes via `/api/v2/` without disrupting existing clients. The gateway does not implement API versioning middleware — it is a simple prefix convention.

Alternative considered: header-based versioning (`Accept: application/vnd.senclaw.v1+json`). Rejected because path-based versioning is simpler to implement, test, and debug, especially during early development.

## Risks / Trade-offs

- [In-memory storage loses all state on restart] → Mitigation: this is intentional for the first cut. The repository interface makes the swap to persistent storage a contained change. Document this limitation clearly.
- [In-process inter-service communication hides network boundary issues] → Mitigation: enforce package-level import boundaries; service code must not reach into another service's internals. The interface contracts are designed to work over HTTP later.
- [Vercel AI SDK is an external dependency that may change] → Mitigation: wrap the SDK behind a `ModelProvider` interface in the agent runner so a provider swap does not leak through the codebase.
- [In-process tool execution has no isolation] → Mitigation: tools in this cut are limited to built-in safe operations. User-supplied or untrusted tool code is deferred to the Rust sandbox boundary component.
- [Agent execution loop may hang on LLM timeouts] → Mitigation: set a configurable per-call timeout and a maximum turn count per run. Both are enforced in the execution loop.
- [Zod schemas in `@senclaw/protocol` may grow large] → Mitigation: organize schemas into domain-specific submodules (`agent.ts`, `run.ts`, `tool.ts`, `message.ts`) with a barrel re-export from `index.ts`.

## Migration Plan

1. Implement `@senclaw/protocol` with domain types first — all other packages depend on it.
2. Implement `@senclaw/config` and `@senclaw/logging` — they are consumed by every service.
3. Implement `@senclaw/observability` with health-check contracts.
4. Implement `@senclaw/tool-runner-host` with the tool registry and built-in tools.
5. Implement `@senclaw/agent-runner` with the execution loop, consuming the tool registry.
6. Implement `@senclaw/gateway` with Fastify routes, consuming the agent runner service layer.
7. Wire the in-process composition in the gateway's startup so a single `pnpm run dev` starts the full stack.
8. Add unit tests for each package and integration tests for the end-to-end flow.

Rollback: since all services are currently stubs, any partial implementation can be reverted by restoring the stub files. The in-memory storage model means there is no data migration to reverse.

## Open Questions

- **[Resolve during agent-execution implementation]** Should the agent runner support parallel tool calls (multiple tool calls in one LLM turn executed concurrently) from the start, or serialize them and add parallelism later?
- **[Resolve during gateway-api implementation]** Should the gateway return a run ID immediately and require polling for results, or block until the run completes? The polling model is more resilient but more complex for the first integration test.
