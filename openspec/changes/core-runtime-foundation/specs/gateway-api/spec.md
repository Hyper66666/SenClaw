## ADDED Requirements

### Requirement: Agent CRUD endpoints
The gateway SHALL expose RESTful endpoints for creating, listing, retrieving, and deleting agent definitions under `/api/v1/agents`.

#### Scenario: Create an agent
- **WHEN** a client sends `POST /api/v1/agents` with a valid agent definition body
- **THEN** the gateway returns `201 Created` with the agent object including a server-generated `id`

#### Scenario: List agents
- **WHEN** a client sends `GET /api/v1/agents`
- **THEN** the gateway returns `200 OK` with an array of all registered agent definitions

#### Scenario: Get agent by ID
- **WHEN** a client sends `GET /api/v1/agents/:id` with a valid agent ID
- **THEN** the gateway returns `200 OK` with the agent definition

#### Scenario: Get non-existent agent
- **WHEN** a client sends `GET /api/v1/agents/:id` with an ID that does not exist
- **THEN** the gateway returns `404 Not Found` with an error body containing `"error"` and `"message"` fields

#### Scenario: Delete an agent
- **WHEN** a client sends `DELETE /api/v1/agents/:id` with a valid agent ID
- **THEN** the gateway returns `204 No Content` and subsequent GET requests for that ID return `404`

### Requirement: Task submission endpoint
The gateway SHALL expose an endpoint for submitting a task to an agent under `/api/v1/tasks`.

#### Scenario: Submit a task
- **WHEN** a client sends `POST /api/v1/tasks` with `{ "agentId": "<id>", "input": "Hello" }`
- **THEN** the gateway returns `201 Created` with a run object containing `runId`, `status: "pending"`, and timestamps

#### Scenario: Submit a task to non-existent agent
- **WHEN** a client sends `POST /api/v1/tasks` with an `agentId` that does not exist
- **THEN** the gateway returns `404 Not Found` with an error indicating the agent was not found

#### Scenario: Submit a task with invalid body
- **WHEN** a client sends `POST /api/v1/tasks` with a body missing the `input` field
- **THEN** the gateway returns `400 Bad Request` with a validation error

### Requirement: Run retrieval endpoints
The gateway SHALL expose endpoints for retrieving run status and message history.

#### Scenario: Get run by ID
- **WHEN** a client sends `GET /api/v1/runs/:id`
- **THEN** the gateway returns `200 OK` with the run object including current status, timestamps, and error (if failed)

#### Scenario: Get run messages
- **WHEN** a client sends `GET /api/v1/runs/:id/messages`
- **THEN** the gateway returns `200 OK` with the ordered array of messages in the run's conversation history

#### Scenario: Get non-existent run
- **WHEN** a client sends `GET /api/v1/runs/:id` with an ID that does not exist
- **THEN** the gateway returns `404 Not Found`

### Requirement: Health-check endpoint
The gateway SHALL expose a `GET /health` endpoint that returns the aggregated health status of the gateway and its dependencies.

#### Scenario: Healthy system
- **WHEN** a client sends `GET /health` and all components are operational
- **THEN** the gateway returns `200 OK` with `{ "status": "healthy" }`

#### Scenario: Degraded system
- **WHEN** a non-critical component reports degraded status
- **THEN** the gateway returns `200 OK` with `{ "status": "degraded", "details": { ... } }`

### Requirement: Request validation and error format
The gateway SHALL validate all incoming request bodies against the corresponding Zod schema and SHALL return errors in a consistent JSON format with `error` (error code) and `message` (human-readable description) fields.

#### Scenario: Invalid JSON body
- **WHEN** a client sends a request with malformed JSON
- **THEN** the gateway returns `400 Bad Request` with `{ "error": "INVALID_JSON", "message": "..." }`

#### Scenario: Schema validation failure
- **WHEN** a client sends a request with valid JSON that fails schema validation
- **THEN** the gateway returns `400 Bad Request` with `{ "error": "VALIDATION_ERROR", "message": "..." }` including field-level details

### Requirement: Request logging and correlation
The gateway SHALL assign a unique correlation ID to each incoming request, include it in all log lines for that request, and return it in the `x-correlation-id` response header.

#### Scenario: Correlation ID is returned in response
- **WHEN** a client sends any request to the gateway
- **THEN** the response includes an `x-correlation-id` header with a unique identifier

#### Scenario: Client-supplied correlation ID is propagated
- **WHEN** a client sends a request with an `x-correlation-id` header
- **THEN** the gateway uses the client-supplied value instead of generating a new one
