## ADDED Requirements

### Requirement: Agents SHALL be loaded from validated definitions
The system SHALL load agent capabilities from declarative definitions rather than hardcoded runtime branches.

#### Scenario: Built-in agent definition is validated on load
- **WHEN** the system loads built-in agent definitions
- **THEN** each definition MUST be validated against the agent definition schema before becoming runnable

#### Scenario: Invalid custom definition is rejected
- **WHEN** a user or project definition contains unsupported fields or incompatible settings
- **THEN** the system MUST reject that definition with a validation error and keep valid definitions available

### Requirement: Agent definitions SHALL control runtime behavior
The system SHALL let agent definitions configure model, tools, effort, isolation, permission mode, max turns, and background eligibility.

#### Scenario: Agent definition scopes tool surface
- **WHEN** an agent definition lists allowed tools
- **THEN** the runtime MUST construct that agent's tool pool from the declared tool set rather than the unrestricted global tool pool

#### Scenario: Agent definition controls background eligibility
- **WHEN** an operator requests background execution for an agent definition that does not allow it
- **THEN** the system MUST reject the request before starting the runtime
