## ADDED Requirements

### Requirement: Rust level 4 sandbox readiness SHALL require cross-platform binary-backed evidence
Senclaw SHALL only claim native Rust sandbox release readiness after binary-backed validation has been recorded on both supported platforms.

#### Scenario: Only one platform has been validated
- **WHEN** Windows validation exists but Linux validation does not
- **THEN** Senclaw SHALL treat Rust level 4 support as partially validated and SHALL NOT describe it as fully release-ready

#### Scenario: Both supported platforms are validated
- **WHEN** binary-backed validation has been recorded on Windows and Linux
- **THEN** Senclaw MAY describe Rust level 4 support as cross-platform validated subject to the remaining release workflow gate

### Requirement: Native sandbox validation SHALL be part of the release workflow
Senclaw SHALL document or automate native sandbox validation as part of release verification.

#### Scenario: Release workflow is reviewed
- **WHEN** an operator or maintainer reviews the release checklist or CI workflow
- **THEN** it SHALL explicitly include the required native sandbox build and integration validation steps for supported platforms
