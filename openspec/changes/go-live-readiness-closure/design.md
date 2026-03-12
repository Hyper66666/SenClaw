## Context

Senclaw already has most of the runtime pieces needed for actual use: gateway auth, SQLite persistence, web console core flows, scheduler, webhook and polling connectors, and TypeScript sandboxing. The remaining problem is not a single missing feature; it is that release claims currently mix together mandatory launch gates, optional infrastructure claims, and documentation/spec drift.

A narrower change is needed because the existing release-alignment umbrella is still broad. The immediate deployment question is simpler: what must be true before Senclaw can be put into use, and what extra evidence is only required when RabbitMQ, Redis, or Rust level 4 sandbox claims are made?

Constraints:
- Supported platforms for this change remain Windows and Linux.
- Repository engine requirements remain Node.js `>=22.0.0` and pnpm `>=10.0.0`.
- Real-provider validation must use operator-supplied environment variables and MUST NOT store secrets in source control.
- Broker-backed queue support and Rust level 4 release claims are conditional; they are only mandatory if those deployment modes are being claimed.

## Goals / Non-Goals

**Goals:**
- Separate mandatory go-live gates from optional production-claim extensions.
- Define a reproducible real-provider smoke path using OpenAI-compatible configuration.
- Require explicit acceptance evidence for the protected web console.
- Define the concrete bar for broker-backed queue support.
- Define the concrete bar for Rust level 4 native sandbox readiness.

**Non-Goals:**
- Redesign the agent runtime or provider abstraction.
- Introduce macOS support in this change.
- Re-architect queue connectors beyond what is needed for RabbitMQ and Redis production claims.
- Replace manual acceptance entirely with browser automation.

## Decisions

### 1. Treat deployment readiness and optional production claims as separate gates
Senclaw SHALL distinguish between the baseline needed to run in production and additional claims that only matter when specific infrastructure is enabled. This keeps webhook/polling-only deployments from being blocked by broker-driver work they do not use, while still preventing inflated readiness claims.

Alternatives considered:
- One universal gate for every capability: rejected because it over-blocks practical deployments.
- No formal separation: rejected because it recreates the current ambiguity.

### 2. Make a real OpenAI-compatible smoke test part of the baseline gate
The repository already proves mocked and in-memory paths. Go-live closure SHALL also require a documented smoke path that exercises a real provider through the existing `openai` provider integration using environment variables. This gives a direct answer to whether task execution can talk to an external model.

Alternatives considered:
- Rely only on unit tests: rejected because it does not validate real credentials, base URLs, or provider compatibility.
- Commit static test credentials: rejected for security reasons.

### 3. Keep protected web-console validation as an explicit manual acceptance step
The web console already has auth-aware code paths, but the go-live bar SHALL require a manual check against an authentication-enabled gateway. This is cheaper and more robust than trying to over-automate browser setup before the release gate itself is stable.

Alternatives considered:
- Treat unit tests as sufficient: rejected because the final risk is operator-facing behavior.
- Add mandatory Playwright automation first: deferred because it is useful but not the shortest path to trustworthy acceptance.

### 4. Require concrete broker behavior before RabbitMQ or Redis support is claimed
A generic `QueueDriver` contract is not enough for a production claim. RabbitMQ and Redis support SHALL only be claimed after concrete drivers, reconnect behavior, ack/nack semantics, retry and dead-letter handling, and broker-backed validation exist.

Alternatives considered:
- Continue calling the abstraction production-ready: rejected because it hides missing runtime behavior.
- De-scope queue support entirely: rejected because broker-backed queues remain an explicit user goal.

### 5. Require cross-platform evidence and workflow integration before claiming native sandbox readiness
Rust level 4 support SHALL remain conditional until Windows and Linux binary-backed validation are both recorded and the release workflow documents or automates the check. A local Windows build alone is evidence of viability, not full release closure.

Alternatives considered:
- Treat one-platform validation as enough: rejected because supported-platform claims are cross-platform.
- Remove native sandbox claims for now: rejected because the feature already exists and only needs disciplined verification language.

## Risks / Trade-offs

- [Risk] `pnpm run verify` may require broad repository formatting cleanup unrelated to current runtime behavior. -> Mitigation: treat it as the top release-management task and keep the diff mechanical.
- [Risk] Real-provider smoke tests can fail for external reasons such as quota, endpoint misconfiguration, or transient network issues. -> Mitigation: document a minimal smoke procedure, expected failure modes, and how to distinguish provider failure from Senclaw failure.
- [Risk] Manual web-console acceptance can become inconsistent across operators. -> Mitigation: define a short checklist with required flows and expected outcomes.
- [Risk] RabbitMQ and Redis drivers can expand scope quickly. -> Mitigation: constrain the first production claim to subscribe/consume flows, reconnect, retry, dead-letter hooks, and observability rather than full ecosystem coverage.
- [Risk] Linux native sandbox validation may require CI or container setup work outside the current workstation. -> Mitigation: record a documented release step even if full CI automation lands one step later.

## Migration Plan

1. Close the mandatory baseline gate first: Node 22, `verify`, real-provider smoke, and protected web-console acceptance.
2. Update release docs to distinguish baseline-ready from optional claim extensions.
3. If broker-backed queue support is part of the target deployment, land RabbitMQ and Redis drivers plus live-broker verification.
4. If Rust level 4 sandbox is part of the target deployment, land Linux validation and release-workflow integration.
5. Re-run the complete readiness matrix and update the OpenSpec task state with evidence.

Rollback strategy:
- If real-provider smoke or web-console acceptance fails, keep Senclaw in "usable for development/internal trial" status and do not upgrade readiness claims.
- If broker or native-sandbox work is incomplete, ship without those claims rather than blocking the entire baseline deployment.

## Open Questions

- Should the real-provider smoke path become a scripted command in `package.json`, or remain a documented operator procedure?
- For Redis queue support, should the first driver target Redis Streams or a simpler queue abstraction?
- Should protected web-console acceptance remain manual permanently, or be replaced later by Playwright-based release checks?
