## ADDED Requirements

### Requirement: Scheduler Readiness Claims SHALL Match Verified Behavior
The project SHALL only describe the scheduler as production-ready after its OpenSpec task state, documentation, and verification evidence reflect the current standalone scheduler implementation.

#### Scenario: Scheduler implementation and task state diverge
- **WHEN** scheduler code or verification is ahead of the recorded OpenSpec task state
- **THEN** readiness documentation SHALL remain partial until the task state is corrected to match verified behavior

### Requirement: Scheduler Storage Coverage SHALL Protect Persisted Job Semantics
Scheduler repository coverage SHALL include persisted job and execution behavior for concurrency checks, failure windows, timezone recalculation, and durable restart semantics.

#### Scenario: Storage behavior changes for jobs or executions
- **WHEN** a scheduler storage change alters persisted job or execution semantics
- **THEN** targeted scheduler repository tests SHALL detect regressions before readiness claims are updated

### Requirement: Scheduler Manual Verification SHALL Use the Standalone Scheduler Process
Release verification for scheduler behavior SHALL use the dedicated scheduler application rather than implicit in-process scheduling inside the gateway.

#### Scenario: Scheduler restart is verified
- **WHEN** the standalone scheduler process is stopped and started again against persistent storage
- **THEN** previously created jobs SHALL remain scheduled and new executions SHALL be observed after restart