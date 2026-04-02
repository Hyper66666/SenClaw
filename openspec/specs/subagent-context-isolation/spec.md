# subagent-context-isolation Specification

## Purpose
TBD - created by archiving change agent-runtime-evolution. Update Purpose after archive.
## Requirements
### Requirement: Subagent context cloning SHALL use explicit isolation rules
The system SHALL create subagent runtime context through a single context factory that explicitly defines which state is cloned, shared, overridden, or denied.

#### Scenario: Default isolation protects parent state
- **WHEN** a subagent context is created with default settings
- **THEN** the system MUST isolate mutable runtime state such as abort control, transient tool decisions, and in-flight response budgeting unless explicit sharing is requested

#### Scenario: Shared fields are opt-in
- **WHEN** a caller requests selected context sharing for a subagent
- **THEN** the context factory MUST apply only the requested shared fields and leave all other mutable state isolated

### Requirement: Subagent context SHALL support controlled overrides
The system SHALL allow the caller to override specific subagent runtime fields such as agent definition, messages, working directory, or response length without mutating the parent context.

#### Scenario: Agent-specific override does not alter parent runtime
- **WHEN** a subagent is launched with an overridden working directory or agent type
- **THEN** the parent run context MUST remain unchanged after subagent creation

#### Scenario: Invalid sharing combinations are rejected
- **WHEN** a caller requests an unsupported sharing combination that would break runtime guarantees
- **THEN** the system MUST reject subagent creation with a clear validation error

