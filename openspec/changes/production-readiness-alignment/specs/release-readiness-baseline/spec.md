## ADDED Requirements

### Requirement: Readiness Claims MUST Match Repository Truth
The repository SHALL only mark modules, docs, and OpenSpec tasks as complete when the corresponding implementation evidence and verification state match the current default branch.

#### Scenario: Completion claim is evaluated against current evidence
- **WHEN** a module or document claims that a subsystem is complete or production-ready
- **THEN** the associated OpenSpec task state, code behavior, and latest verification evidence MUST agree on what is finished and what remains blocked

### Requirement: Verification Baseline SHALL Be Explicit
The project SHALL define `pnpm run verify`, `pnpm run test`, and `pnpm run test:integration` as separate readiness signals and SHALL document which signal is currently blocking release readiness.

#### Scenario: Verify fails while tests pass
- **WHEN** unit and integration tests pass but `pnpm run verify` fails
- **THEN** readiness documentation and task status MUST identify `verify` as the blocking signal and SHALL NOT report full readiness

### Requirement: Status Documents SHALL Avoid Stale Claims
The README, production-readiness docs, and summary status documents MUST not contain stale version requirements, placeholder repository metadata, unsupported scripts, or outdated test counts.

#### Scenario: Documentation references repository metadata
- **WHEN** documentation mentions Node versions, package names, start commands, repository URLs, or test totals
- **THEN** those values MUST match the current repository configuration and runnable scripts