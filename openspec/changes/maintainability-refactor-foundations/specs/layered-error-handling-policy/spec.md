## ADDED Requirements

### Requirement: Error handling strategies are explicitly classified
First-party runtime code SHALL classify catch-handling behavior as fail-fast, degrade-and-continue, retry/poll, or intentionally swallowed with rationale.

#### Scenario: A non-fatal catch is justified
- **WHEN** code catches an error without surfacing it directly to the caller
- **THEN** the code path documents whether the behavior is retry, degradation, or intentional swallow and why it is acceptable

### Requirement: Operator-facing auth and permission failures are handled consistently
First-party operator surfaces SHALL surface authentication, authorization, and missing-configuration failures through consistent typed handling rather than ad hoc error translation.

#### Scenario: A first-party surface receives an auth failure
- **WHEN** CLI or Web receives a missing API key, `401`, or `403` response
- **THEN** it maps that failure through the shared first-party error-handling policy instead of each caller inventing its own translation rules
