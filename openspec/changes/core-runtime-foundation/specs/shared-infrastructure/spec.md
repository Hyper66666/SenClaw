## ADDED Requirements

### Requirement: Typed configuration loading
The `@senclaw/config` package SHALL load configuration from environment variables and `.env` files, validate values against a Zod schema, and return a typed configuration object. Missing required values SHALL cause a startup error with a descriptive message.

#### Scenario: Valid environment produces typed config
- **WHEN** environment variables `SENCLAW_LOG_LEVEL=debug` and `SENCLAW_GATEWAY_PORT=4100` are set
- **THEN** `loadConfig()` returns a typed object with `logLevel === "debug"` and `gatewayPort === 4100`

#### Scenario: Missing required variable causes error
- **WHEN** a required configuration variable is unset and has no default
- **THEN** `loadConfig()` throws an error whose message includes the variable name and expected type

#### Scenario: .env file is loaded as fallback
- **WHEN** a `.env` file exists in the workspace root and a variable is not set in the process environment
- **THEN** the value from `.env` is used

### Requirement: Structured JSON logging
The `@senclaw/logging` package SHALL export a `createLogger` function that returns a pino logger instance configured with JSON output, a configurable log level, and the service name as a default field.

#### Scenario: Logger outputs structured JSON
- **WHEN** a service calls `logger.info({ event: "started" }, "server ready")`
- **THEN** the output is a single JSON line containing `"level"`, `"time"`, `"msg"`, `"service"`, and `"event"` fields

#### Scenario: Log level is configurable
- **WHEN** `SENCLAW_LOG_LEVEL` is set to `warn`
- **THEN** `logger.info(...)` does not produce output and `logger.warn(...)` does

### Requirement: Request-scoped correlation ID
The `@senclaw/logging` package SHALL provide a mechanism to propagate a correlation ID through async call chains using `AsyncLocalStorage`, so that all log lines within a single request share the same `correlationId` field.

#### Scenario: Correlation ID appears in logs within a request
- **WHEN** the gateway sets a correlation ID at the start of a request and downstream code logs messages
- **THEN** every log line within that request includes the same `correlationId` value

#### Scenario: Concurrent requests have independent correlation IDs
- **WHEN** two requests are processed concurrently
- **THEN** their log lines contain different `correlationId` values

### Requirement: Health-check contract
The `@senclaw/observability` package SHALL export a health-check interface that each service implements. The health check SHALL return a status (`healthy`, `degraded`, `unhealthy`) and optional detail fields.

#### Scenario: Healthy service returns status
- **WHEN** a service's health check is invoked and all dependencies are available
- **THEN** it returns `{ status: "healthy" }`

#### Scenario: Degraded service returns detail
- **WHEN** a service's health check detects a non-critical issue
- **THEN** it returns `{ status: "degraded", detail: "<reason>" }`

### Requirement: Basic metrics collection
The `@senclaw/observability` package SHALL export a metrics interface supporting counters and histograms. Services use this interface to record request counts, error counts, and response latencies.

#### Scenario: Counter increments are recorded
- **WHEN** a service calls `metrics.increment("requests_total", { route: "/api/v1/agents" })`
- **THEN** the counter value increases by 1

#### Scenario: Histogram observations are recorded
- **WHEN** a service calls `metrics.observe("request_duration_ms", 42, { route: "/api/v1/tasks" })`
- **THEN** the observation is stored and retrievable for the given metric name and labels
