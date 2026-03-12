## ADDED Requirements

### Requirement: Web Console SHALL Support Authenticated API Sessions
The web console SHALL allow operators to provide a bearer token for protected gateway endpoints and SHALL attach that token to every protected API request.

#### Scenario: Protected request uses configured bearer token
- **WHEN** the web console requests agents, runs, tasks, jobs, keys, or other protected resources with a configured token
- **THEN** the request SHALL include `Authorization: Bearer <token>`

#### Scenario: Missing token blocks protected request flow
- **WHEN** the operator attempts a protected console operation without a configured token
- **THEN** the UI SHALL present a recoverable authentication error or prompt instead of silently issuing unauthenticated protected calls

### Requirement: Web API Client SHALL Handle No-Content Success Responses
The web API client MUST treat successful `204 No Content` responses as successful operations without attempting JSON parsing.

#### Scenario: Delete request returns no body
- **WHEN** a protected delete endpoint responds with `204 No Content`
- **THEN** the client SHALL resolve the operation successfully and update UI state without throwing a parse error

### Requirement: Web Console SHALL Surface Authorization Failures Clearly
The web console SHALL provide actionable feedback for `401` and `403` responses from protected gateway endpoints.

#### Scenario: Gateway rejects a request
- **WHEN** the gateway returns `401 Unauthorized` or `403 Forbidden`
- **THEN** the UI SHALL show an authentication or authorization error that allows the operator to correct the token or retry