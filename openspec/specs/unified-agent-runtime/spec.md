# unified-agent-runtime Specification

## Purpose
TBD - created by archiving change agent-runtime-evolution. Update Purpose after archive.
## Requirements
### Requirement: Main runs and subagents share one execution runtime
The system SHALL execute delegated subagent work through the same core runtime loop used for direct SenClaw runs, including model invocation, tool orchestration, permission handling, and status updates.

#### Scenario: Subagent reuses the main execution loop
- **WHEN** an agent delegates work to a subagent
- **THEN** the system MUST enter the existing run execution loop with a subagent-specific runtime context instead of a separate lightweight executor

#### Scenario: Runtime improvements apply to both direct and delegated work
- **WHEN** the shared runtime gains a new behavior such as improved approvals or tool streaming
- **THEN** both direct runs and subagent runs MUST inherit that behavior without requiring a second implementation path

### Requirement: Runtime identity SHALL distinguish delegated executions
The system SHALL assign delegated executions their own runtime identity while preserving parent-child linkage for status, tracing, and persistence.

#### Scenario: Parent-child execution linkage is recorded
- **WHEN** a subagent run starts
- **THEN** the system MUST persist both the subagent identity and its parent run or task identity

#### Scenario: Delegated execution can be inspected independently
- **WHEN** an operator inspects a delegated agent run
- **THEN** the system MUST show its own status and outputs without losing the relationship to the parent execution

