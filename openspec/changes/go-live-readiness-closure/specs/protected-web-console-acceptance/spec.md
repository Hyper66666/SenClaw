## ADDED Requirements

### Requirement: The web console SHALL support acceptance against an authentication-enabled gateway
Senclaw SHALL support a protected web-console flow in which an operator provides a bearer token and successfully performs core gateway operations against an authentication-enabled deployment.

#### Scenario: Operator completes core protected flows
- **WHEN** a valid bearer token is configured in the web console session
- **THEN** the operator SHALL be able to list agents, create an agent, submit a task, inspect a run, and complete delete flows without authentication regressions

#### Scenario: Operator token is missing or invalid
- **WHEN** the web console attempts a protected operation without a valid bearer token
- **THEN** the UI SHALL present a recoverable authentication error state instead of failing silently or leaving the operator without remediation

### Requirement: Protected web-console acceptance SHALL be recorded as go-live evidence
Senclaw SHALL record that protected web-console acceptance has been performed before it is claimed as deployment-ready for operator use.

#### Scenario: Release evidence is updated
- **WHEN** protected web-console acceptance is completed
- **THEN** the readiness documentation or task state SHALL record the date and scope of the acceptance run
