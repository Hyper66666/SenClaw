# Senclaw Production Readiness

This document records the current release-readiness truth for Senclaw. It is intentionally stricter than feature-complete marketing language: a subsystem is only treated as release-ready when the implementation, OpenSpec state, and verification evidence line up.

## Go-Live Status Summary

As of April 1, 2026, Senclaw is locally green on Windows and can be used for internal or controlled deployment trials. The Windows baseline go-live gate is closed; remaining work is limited to optional production extensions such as live-broker queue validation, Linux native sandbox validation, and the final coordinator/delegated-runtime closure in `agent-runtime-evolution`.

Baseline evidence already recorded:

- `pnpm run build`: pass
- `pnpm run test`: pass (`72` test files, `330` tests)
- `pnpm run test:integration`: pass (`7` test files, `21` tests) plus an opt-in live-broker suite (`1` file, `4` skipped without broker env)
- `pnpm run verify`: pass
- supported-runtime rerun: pass on March 16, 2026 on Windows using portable Node `v22.22.1`; `build`, `test`, `test:integration`, and `verify` all passed
- real OpenAI-compatible smoke validation: pass on March 12, 2026 against the Volcengine Ark OpenAI-compatible endpoint using model `doubao-seed-2.0-pro`; the smoke prompt returned `OK`

## Release Summary

Implemented and locally verified:

- core runtime foundation
- persistent SQLite storage
- API-key authentication and RBAC
- observability metrics and tracing wiring
- web console core flows, including authenticated API-key session support
- standalone scheduler app and gateway job routes
- connector worker webhook flow, polling support, concrete RabbitMQ and Redis queue drivers, and default gateway queue dispatch
- TypeScript tool sandbox levels 0 through 3
- repository-wide `verify` gate
- real-provider smoke path through the existing `openai` provider integration
- Windows native sandbox release build path
- shared agent runtime entrypoint for direct and delegated execution contexts
- persisted background agent tasks with transcript history and follow-up queues
- declarative agent definitions with runtime fields such as `mode`, `background`, `maxTurns`, `effort`, and `isolation`
- coordinator-mode prompt and orchestration-tool filtering
- tool concurrency policy with explicit safe batching and sibling-cancel behavior

Implemented but not fully release-closed:

- protected web-console acceptance was recorded on March 16, 2026 through an Edge Playwright acceptance run captured in `.tmp/web-acceptance/web-auth-acceptance.json`
- Rust sandbox level 4 integration exists, with local Windows build evidence recorded; Linux build validation is still pending
- broker-backed queue drivers exist with unit coverage and runtime wiring, but live-broker validation is not yet recorded
- agent runtime evolution still has remaining closure work for delegated subagent proofs, coordinator behavior coverage, and final operator docs

## Agent Runtime Status

Status: implemented enough for operator use, but not yet fully archived as complete.

Evidence recorded:

- background task persistence via `agent_tasks`, `agent_task_messages`, and `agent_task_pending_messages`
- gateway API routes for background task creation, inspection, transcript viewing, follow-up messages, and resume
- CLI commands for background task creation, listing, inspection, transcript viewing, resume, and follow-up messages
- web console pages for background task listing, transcript inspection, resume, and follow-up messages
- coordinator-mode runtime helpers and `agent_tasks.*` orchestration tools
- tool-level concurrency batching with explicit `concurrency.safe` declarations
- integration coverage in `tests/integration/background-agent-flow.test.ts`

Still open before the entire agent-runtime change is claimed complete:

- proof that delegated subagents initiated from agent reasoning use the shared runtime path end to end
- coordinator behavior coverage for “answer directly vs delegate” decisions
- final operator docs that fully close the remaining OpenSpec tasks

## Current Conditional Blockers

- RabbitMQ and Redis drivers are implemented locally, but live-broker validation is still incomplete
- Linux native sandbox validation is still incomplete for Rust level 4 claims
- agent-runtime-evolution still has remaining closure work around delegated subagent execution proofs and final operator guidance

## Next Priority Work

1. Complete the remaining `agent-runtime-evolution` behavior and documentation closure.
2. Record RabbitMQ and Redis live-broker validation if broker-backed support is required.
3. Record dedicated Linux native sandbox build validation if level 4 native sandbox claims are required.
