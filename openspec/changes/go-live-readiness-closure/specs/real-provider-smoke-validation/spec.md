## ADDED Requirements

### Requirement: Senclaw SHALL provide a real OpenAI-compatible smoke validation path
Senclaw SHALL provide a documented validation flow that exercises a real OpenAI-compatible model provider through the existing `openai` provider integration using operator-supplied environment variables.

#### Scenario: Operator runs a real-provider smoke test
- **WHEN** the operator supplies a valid base URL, API key, and model through environment variables
- **THEN** Senclaw SHALL be able to execute a smoke flow that proves an agent task can reach the external model provider and return a successful run outcome or a diagnosable provider error

#### Scenario: Required provider configuration is missing
- **WHEN** the operator attempts the smoke flow without the required environment variables
- **THEN** the validation path SHALL fail fast with instructions about the missing configuration instead of silently falling back to mocked behavior

### Requirement: Real-provider validation SHALL avoid persisting secrets
Senclaw SHALL keep external provider secrets out of source-controlled files and generated artifacts.

#### Scenario: Smoke validation is documented
- **WHEN** repository docs or scripts describe the smoke procedure
- **THEN** they SHALL refer to operator-supplied environment variables or local runtime input and SHALL NOT embed plaintext credentials
