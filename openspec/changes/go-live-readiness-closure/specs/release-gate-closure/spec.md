## ADDED Requirements

### Requirement: Deployment readiness SHALL require a supported runtime and green repository gates
Senclaw SHALL only be claimed as deployment-ready when it is evaluated on a supported runtime environment and the repository readiness gates succeed.

#### Scenario: Unsupported runtime blocks readiness claims
- **WHEN** the repository is evaluated on a Node.js version below the documented minimum
- **THEN** Senclaw SHALL treat the environment as unsupported for deployment-readiness claims

#### Scenario: Failing verification blocks readiness claims
- **WHEN** any of `pnpm run build`, `pnpm run test`, `pnpm run test:integration`, or `pnpm run verify` fails
- **THEN** Senclaw SHALL NOT be described as fully deployment-ready in repository readiness documentation

### Requirement: Readiness documentation SHALL distinguish baseline deployment from optional claims
Senclaw SHALL distinguish the minimum baseline required to put the system into use from optional production claims for broker-backed queues or native Rust sandbox enforcement.

#### Scenario: Optional claim remains incomplete
- **WHEN** the baseline deployment gate is green but RabbitMQ, Redis, or Rust level 4 release evidence is incomplete
- **THEN** readiness documentation SHALL describe Senclaw as usable within the completed baseline and SHALL explicitly identify the incomplete optional claims
