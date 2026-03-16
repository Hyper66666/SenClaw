## ADDED Requirements

### Requirement: Gateway runtime assembly is decomposed into focused modules
The gateway composition root SHALL delegate storage wiring, auth wiring, connector lifecycle setup, and route registration to dedicated helpers while preserving the top-level startup flow.

#### Scenario: Gateway startup flow remains readable after decomposition
- **WHEN** a maintainer reads the gateway server entrypoint
- **THEN** they can still see the startup sequence at the top level without needing to inspect a single monolithic implementation file

### Requirement: Sandbox orchestration separates policy concerns
The sandbox runtime SHALL separate worker source, filesystem policy, network policy, resource monitoring, and process orchestration into focused modules.

#### Scenario: Sandbox policy changes do not require editing the whole runner
- **WHEN** a maintainer changes filesystem, network, or CPU enforcement behavior
- **THEN** the change is made in a dedicated policy module instead of a single monolithic sandbox implementation file
