## 1. Release Baseline Alignment

- [x] 1.1 Inventory current readiness mismatches across `README.md`, `PRODUCTION_READINESS.md`, root scripts, and OpenSpec task files.
- [x] 1.2 Define the authoritative readiness matrix for `pnpm run build`, `pnpm run test`, `pnpm run test:integration`, `pnpm run verify`, and native Rust validation.
- [x] 1.3 Correct top-level repository metadata in docs (Node version, repository URL, runnable package names, start commands, and current test totals).
- [x] 1.4 Remove or downgrade completion claims that are not backed by the current readiness matrix.
- [x] 1.5 Align `web-console`, `connector-worker`, `tool-sandbox`, `scheduler`, and `cli-tool` OpenSpec task/status files with verified implementation reality.
- [x] 1.6 Resolve or explicitly isolate the repository-wide `verify` blockers so release claims are based on a real gate instead of partial signals.

## 2. Web Console Authenticated Operations

- [x] 2.1 Add a lightweight web-console API-key session model for protected gateway operations.
- [x] 2.2 Update the web API client to attach `Authorization: Bearer <token>` to protected requests.
- [x] 2.3 Make the web API client treat `204 No Content` as a successful no-body response.
- [x] 2.4 Add auth-aware UI handling for missing token, `401`, and `403` states.
- [x] 2.5 Add or update web tests for token propagation, auth failures, and `204` delete flows.
- [ ] 2.6 Verify the web console against a gateway instance with API authentication enabled by default.

## 3. Queue Connector Runtime

- [ ] 3.1 Define concrete configuration and protocol expectations for RabbitMQ and Redis queue drivers.
- [ ] 3.2 Implement a RabbitMQ queue driver behind the existing `QueueDriver` interface.
- [ ] 3.3 Implement a Redis-backed queue driver behind the existing `QueueDriver` interface.
- [ ] 3.4 Add reconnect and subscription-recovery behavior for transient broker disconnects.
- [ ] 3.5 Add configurable ack, nack, retry, and dead-letter integration points to queue processing.
- [ ] 3.6 Emit queue-driver logs and metrics for subscription health, throughput, retries, and failures.
- [ ] 3.7 Add unit and integration coverage for queue driver lifecycle, reconnect, and failure behavior.
- [ ] 3.8 Wire supported queue drivers into the runtime lifecycle and document supported broker modes.

## 4. Rust Sandbox Validation

- [x] 4.1 Document Windows and Linux prerequisites for building `native/sandbox-runner`.
- [x] 4.2 Confirm the tool runner host surfaces clear missing-binary behavior for level 4 execution.
- [x] 4.3 Build the native sandbox runner on Windows and record successful binary-backed validation.
- [ ] 4.4 Build the native sandbox runner on Linux and record successful binary-backed validation.
- [ ] 4.5 Enable or formalize binary-backed validation in CI or the release verification workflow.
- [x] 4.6 Update tool-sandbox docs and task state to reflect real native validation status instead of skipped-contract-only evidence.

## 5. Scheduler Readiness Closure

- [x] 5.1 Reconcile the scheduler change's remaining unchecked tasks with the code and manual verification already completed.
- [x] 5.2 Confirm `scheduled_jobs` and `job_executions` schema/constraints match scheduler docs and readiness expectations.
- [x] 5.3 Add any missing scheduler storage/repository tests for persisted job semantics, concurrency, failure windows, and timezone recalculation.
- [x] 5.4 Keep the standalone `apps/scheduler` process as the only documented manual verification target.
- [x] 5.5 Update scheduler docs and readiness wording to reflect verified behavior and any remaining blockers precisely.

## 6. Documentation and Release Artifacts

- [x] 6.1 Rewrite `README.md` to match current package names, supported startup flows, and supported platforms.
- [x] 6.2 Rewrite `PRODUCTION_READINESS.md` to reflect current evidence, real blockers, and verified subsystem status.
- [x] 6.3 Document authenticated web-console usage, queue driver setup, and Rust sandbox validation in the relevant docs.
- [x] 6.4 Add a concise release-readiness summary that explains what is complete, what is optional, and what still blocks full readiness.

## 7. Verification

- [x] 7.1 Run `pnpm run build` and confirm it passes.
- [x] 7.2 Run `pnpm run test` and confirm it passes.
- [x] 7.3 Run `pnpm run test:integration` and confirm it passes.
- [ ] 7.4 Run `pnpm run verify` and confirm it passes.
- [x] 7.5 Run native sandbox build checks on Windows and record the result.
- [ ] 7.6 Run native sandbox build checks on Linux and record the result.
- [ ] 7.7 Manually verify authenticated web-console flows against protected gateway endpoints.
- [ ] 7.8 Manually verify supported queue drivers can start, recover, and process messages with the configured brokers.

