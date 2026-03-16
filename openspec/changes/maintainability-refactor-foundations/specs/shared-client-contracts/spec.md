## ADDED Requirements

### Requirement: First-party clients use canonical Senclaw contracts
The system SHALL define `Agent`, `Run`, and `Message` contracts once for first-party clients, and CLI and Web SHALL consume those shared contracts instead of redefining equivalent local DTOs.

#### Scenario: CLI and Web use the same contract source
- **WHEN** a first-party client needs `Agent`, `Run`, or `Message` shapes
- **THEN** it imports those shapes from the shared contract source rather than declaring parallel local interfaces

### Requirement: Shared status semantics are centralized
The system SHALL centralize repeated first-party status-to-variant mappings once they are reused across multiple pages or surfaces.

#### Scenario: Run status presentation is updated in one place
- **WHEN** the first-party UI changes how a run status maps to a badge or variant
- **THEN** the shared mapping source is updated once and the dependent pages inherit the change
