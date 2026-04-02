# constrained-coordinator-mode Specification

## Purpose
TBD - created by archiving change agent-runtime-evolution. Update Purpose after archive.
## Requirements
### Requirement: Coordinator mode SHALL use a constrained tool surface
The system SHALL expose a reduced tool surface for coordinator-style agents so they focus on delegation, inspection, and communication rather than unrestricted direct execution.

#### Scenario: Coordinator receives filtered tools
- **WHEN** an agent enters coordinator mode
- **THEN** the runtime MUST provide only the coordinator-approved tools for delegation and worker management

#### Scenario: Disallowed coordinator tool is blocked
- **WHEN** a coordinator attempts to use a tool outside its allowed surface
- **THEN** the system MUST reject the action with a structured runtime error

### Requirement: Coordinator mode SHALL guide delegation explicitly
The system SHALL pair coordinator mode with dedicated orchestration instructions that describe when to answer directly, when to spawn workers, when to resume workers, and how to interpret worker notifications.

#### Scenario: Coordinator chooses direct answer when delegation is unnecessary
- **WHEN** the task can be answered without worker assistance
- **THEN** the system MUST allow the coordinator to answer directly instead of forcing worker creation

#### Scenario: Coordinator reuses an existing worker when appropriate
- **WHEN** a relevant worker task already exists for the current workstream
- **THEN** the system MUST let the coordinator continue that worker instead of always creating a new one

