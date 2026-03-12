## ADDED Requirements

### Requirement: Native Sandbox Runner SHALL Build on Supported Platforms
The repository SHALL document and validate native sandbox builds for Windows and Linux.

#### Scenario: Supported platform build is executed
- **WHEN** the native sandbox build is run on Windows or Linux with documented prerequisites installed
- **THEN** the build SHALL produce a runnable sandbox binary for that platform

### Requirement: Level 4 Sandbox SHALL Use the Native Runner Contract
The tool runner host SHALL invoke the native sandbox runner for level 4 tools through a documented structured CLI contract.

#### Scenario: Native binary is available for a level 4 tool
- **WHEN** a level 4 tool is executed and the native runner binary is available
- **THEN** the host SHALL route execution through the native runner and receive a structured success or error response

### Requirement: Native Validation SHALL Be Part of Readiness Evidence
The project SHALL not claim the native Rust sandbox path complete unless the binary has been built and exercised through automated or recorded integration verification.

#### Scenario: Native binary is missing during local verification
- **WHEN** a CLI contract or integration test cannot find the native runner binary
- **THEN** local verification MAY skip the binary-backed test, but readiness documentation and task state MUST keep native validation incomplete until build evidence exists

### Requirement: Missing Native Support SHALL Be Explicit
The system SHALL surface clear operator-facing behavior when native level 4 execution is unavailable.

#### Scenario: Level 4 execution is requested without a usable native runner
- **WHEN** a level 4 tool is invoked and the native runner is missing or unusable
- **THEN** the host SHALL fail with a clear operator message or documented fallback behavior instead of silently claiming native isolation