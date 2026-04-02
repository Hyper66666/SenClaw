## ADDED Requirements

### Requirement: Background agents SHALL persist resumable task state
The system SHALL persist background agent task state including transcript, metadata, selected agent definition, status, and pending follow-up messages.

#### Scenario: Background task persists lifecycle state
- **WHEN** an agent is launched in background mode
- **THEN** the system MUST store a resumable task record before the background runtime begins processing

#### Scenario: Background task survives process interruption
- **WHEN** the process restarts after a background agent has been registered
- **THEN** the system MUST retain enough persisted state to inspect or resume the agent task

### Requirement: Background agents SHALL support resume and follow-up messaging
The system SHALL allow operators and coordinating agents to send additional messages to a paused or stopped background agent and resume execution from persisted context.

#### Scenario: Follow-up message queues for a running background agent
- **WHEN** a follow-up message targets a currently running background agent
- **THEN** the system MUST enqueue the message for that agent instead of creating a duplicate task

#### Scenario: Resume restores prior transcript and metadata
- **WHEN** a stopped background agent is resumed
- **THEN** the system MUST reload its persisted transcript and metadata and continue from that state rather than starting a fresh run

#### Scenario: Invalid resume state is reported clearly
- **WHEN** required transcript or metadata is missing or malformed during resume
- **THEN** the system MUST fail the resume request with a structured error and preserve the task for inspection
