## Why

Senclaw is close to being usable, but the remaining release decisions are still blurred together: some gaps actually block go-live, while others only block optional production claims. We need a narrower OpenSpec change that defines the minimum closure work for a real deployment decision and separates that from conditional broker and native-sandbox claims.

## What Changes

- Define the minimum go-live gate for Senclaw: supported Node version, green repository verification, real-provider smoke validation, and protected web-console acceptance evidence.
- Add explicit requirements for running a real OpenAI-compatible smoke test without committing secrets into the repository.
- Add explicit acceptance requirements for the web console against an authentication-enabled gateway.
- Add conditional production requirements for RabbitMQ and Redis queue support so those claims are only made after concrete drivers and live-broker validation exist.
- Add conditional production requirements for the Rust level 4 sandbox so that native readiness is only claimed after Windows and Linux evidence plus release-workflow integration exist.

## Capabilities

### New Capabilities
- `release-gate-closure`: Defines the minimum verification and environment gate required before Senclaw can be claimed as ready for deployment.
- `real-provider-smoke-validation`: Defines how Senclaw validates a real OpenAI-compatible provider using operator-supplied configuration without storing secrets.
- `protected-web-console-acceptance`: Defines manual acceptance criteria for the web console when gateway authentication is enabled.
- `broker-backed-queue-support`: Defines the conditions under which RabbitMQ and Redis queue support may be claimed as production-ready.
- `native-sandbox-release-verification`: Defines the cross-platform evidence and workflow requirements for claiming Rust level 4 sandbox readiness.

### Modified Capabilities
- None.

## Impact

- Affected code: `apps/gateway`, `apps/web`, `apps/agent-runner`, `packages/connector-worker`, `apps/tool-runner-host`, `native/sandbox-runner`, CI workflows, smoke scripts
- Affected docs/specs: `README.md`, `PRODUCTION_READINESS.md`, `docs/api/*`, `openspec/**/*`
- Affected verification: `pnpm run build`, `pnpm run test`, `pnpm run test:integration`, `pnpm run verify`, real-provider smoke checks, protected web-console acceptance, broker-backed queue validation, native sandbox validation
- Potential dependencies: RabbitMQ client library, Redis queue client library, CI/runtime prerequisites for Node 22 and Rust toolchains
