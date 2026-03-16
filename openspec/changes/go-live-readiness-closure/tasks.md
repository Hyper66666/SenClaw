## 1. Baseline Release Gate

- [x] 1.1 Normalize the minimum deployment gate in docs: Node.js `>=22.0.0`, `pnpm run build`, `pnpm run test`, `pnpm run test:integration`, and `pnpm run verify`.
- [x] 1.2 Clean up the current repository-wide `verify` blockers until the full command passes on the supported toolchain.
- [x] 1.3 Re-run the readiness matrix on Node 22 and record the evidence in `PRODUCTION_READINESS.md`.

Note: on March 16, 2026, the supported-runtime matrix was rerun successfully on Windows using a portable Node `v22.22.1` runtime. The local default Node install is still `v20.11.0`, but supported-runtime evidence is now recorded.

## 2. Real Provider Smoke Validation

- [x] 2.1 Define the operator-facing environment contract for OpenAI-compatible smoke validation without storing secrets in source control.
- [x] 2.2 Add a documented or scripted smoke path that exercises the existing `openai` provider integration against a real endpoint.
- [x] 2.3 Run the smoke validation against the target OpenAI-compatible provider and record the result, expected output, and failure modes.

Evidence: on March 12, 2026, `corepack pnpm run test:provider-smoke` succeeded against the Ark OpenAI-compatible endpoint with model `doubao-seed-2.0-pro`; the assistant response was `OK`.

## 3. Protected Web Console Acceptance

- [x] 3.1 Write a short acceptance checklist for the web console against an authentication-enabled gateway.
- [x] 3.2 Verify with a valid bearer token that the operator can list agents, create an agent, submit a task, inspect a run, and complete a `204` delete flow.
- [x] 3.3 Verify that missing, invalid, and revoked tokens produce recoverable UI behavior and record the acceptance evidence.

Note: on March 16, 2026, browser-level web-console recovery was recorded through a Python Playwright + Edge run at `.tmp/web-acceptance/web-auth-acceptance.json`. Missing-token, invalid-token, and revoked-token scenarios all showed recoverable UI behavior, and each scenario recovered successfully after saving a valid key.

## 4. Conditional Broker-Backed Queue Support

- [x] 4.1 Define concrete RabbitMQ and Redis configuration/schema expectations for production queue drivers.
- [x] 4.2 Implement a RabbitMQ queue driver behind `QueueDriver`.
- [x] 4.3 Implement a Redis queue driver behind `QueueDriver`.
- [x] 4.4 Add reconnect, ack/nack, retry, dead-letter, and observability behavior to the concrete drivers.
- [ ] 4.5 Add unit and live-broker integration coverage for startup, recovery, and message-processing behavior.
- [x] 4.6 Wire the supported queue drivers into runtime configuration and update queue support docs with the exact supported broker modes.

Note: broker-backed drivers now exist locally with unit coverage, default gateway wiring, and an opt-in live-broker suite at `tests/integration/queue-brokers-live.test.ts`. Configure `SENCLAW_TEST_RABBITMQ_URL` and/or `SENCLAW_TEST_REDIS_URL` to execute the real-broker checks. Recorded RabbitMQ and Redis evidence still remains open before release-ready claims can be made.

## 5. Conditional Native Sandbox Release Verification

- [x] 5.1 Document the exact Windows and Linux prerequisites and commands for binary-backed Rust sandbox verification.
- [x] 5.2 Re-verify the Windows native sandbox path and record the release evidence in docs or workflow notes.
- [ ] 5.3 Validate the Linux native sandbox path and record the release evidence.
- [x] 5.4 Add the native sandbox verification step to CI or to a formal release checklist.

Note: `cargo build --release --manifest-path native/sandbox-runner/Cargo.toml` was revalidated locally on Windows on March 12, 2026. Linux evidence is still missing.

## 6. Final Sign-off

- [x] 6.1 Update OpenSpec task files and readiness docs so the final state matches verified evidence.
- [x] 6.2 Decide whether the target deployment claims broker-backed queues and Rust level 4 readiness, and downgrade any unsupported claims.
- [x] 6.3 Publish the final go-live status summary that distinguishes baseline deployment readiness from optional production extensions.

Summary: Windows baseline readiness now includes a green local repository gate, a recorded real-provider smoke run, a supported-runtime Node 22 rerun, and recorded protected web-console acceptance. Broker-backed queues and cross-platform Rust level 4 readiness remain optional and are not currently claimed.

