## 1. Runtime Foundations

- [x] 1.1 Inventory the current `apps/agent-runner` execution loop, run lifecycle, and persistence touchpoints that must be reused by subagents.
- [x] 1.2 Define protocol types for parent-child run identity, background agent task metadata, and resumable transcript references.
- [x] 1.3 Add storage schema or repository support for persisted agent transcript and metadata records.
- [x] 1.4 Add validation and repository helpers for queued follow-up agent messages.

## 2. Unified Agent Runtime

- [x] 2.1 Extract the execution loop entry contract so direct runs and delegated runs can invoke the same runtime with different context.
- [x] 2.2 Add parent-child run linkage to runtime status updates, tracing, and persistence.
- [x] 2.3 Ensure runtime-level approvals, tool streaming, and failure handling behave identically for direct and delegated runs.
- [x] 2.4 Add regression tests proving subagent execution reuses the main runtime path instead of a separate executor.

## 3. Subagent Context Isolation

- [x] 3.1 Introduce a `createSubagentContext`-style factory in the agent runtime layer.
- [x] 3.2 Define default isolation behavior for mutable runtime state such as abort controllers, tool decisions, and response-length controls.
- [x] 3.3 Add opt-in sharing flags for fields that may be shared safely across parent and child execution.
- [x] 3.4 Add explicit override handling for agent definition, messages, working directory, and runtime options.
- [x] 3.5 Reject unsupported or unsafe sharing combinations with structured errors.
- [x] 3.6 Add unit tests for default isolation, explicit sharing, and invalid combinations.

## 4. Resumable Background Agent Tasks

- [x] 4.1 Add background agent registration that persists transcript, metadata, status, and selected definition before execution begins.
- [x] 4.2 Persist transcript updates and task metadata throughout background execution.
- [x] 4.3 Add API or service entrypoints to resume a background agent from persisted state.
- [x] 4.4 Add API or service entrypoints to send follow-up messages to running or stopped background agents.
- [x] 4.5 Ensure follow-up messages queue for running agents and trigger resume for stopped agents.
- [x] 4.6 Add integration tests covering background launch, interruption, resume, and queued follow-up messages.

## 5. Tool Concurrency Policy

- [x] 5.1 Extend tool definitions with a concurrency-safety declaration.
- [x] 5.2 Update tool orchestration to partition concurrency-safe and serialized tool batches.
- [x] 5.3 Keep context-modifying tools serialized by default unless explicitly proven safe.
- [x] 5.4 Add cancellation/error propagation policy for concurrent tool batches.
- [x] 5.5 Add tests covering concurrent safe tools, serialized unsafe tools, and sibling cancellation behavior.

## 6. Data-Driven Agent Definitions

- [x] 6.1 Define the declarative agent schema for model, tools, effort, isolation, permission mode, max turns, and background eligibility.
- [x] 6.2 Build loaders for built-in and user/project agent definitions with strict validation.
- [x] 6.3 Migrate the current default SenClaw agent into the declarative definition format.
- [x] 6.4 Enforce definition-driven tool pools and runtime options during agent startup.
- [x] 6.5 Add tests for valid definitions, invalid definitions, and background eligibility enforcement.

## 7. Constrained Coordinator Mode

- [x] 7.1 Define the coordinator mode prompt and runtime policy for delegation, reuse, and direct-answer decisions.
- [x] 7.2 Add coordinator-specific tool filtering so the coordinator receives only orchestration-safe capabilities.
- [x] 7.3 Wire coordinator flows to background agent notifications, resume, and follow-up messaging.
- [x] 7.4 Add tests covering direct answers, worker creation, and worker reuse in coordinator mode.

## 8. Surfaces and Verification

- [x] 8.1 Expose background agent lifecycle operations in the gateway, CLI, and web surfaces as needed for inspection and continuation.
- [x] 8.2 Document the new runtime model, agent definition schema, and background resume flows.
- [x] 8.3 Add end-to-end verification for delegated runs, resumable tasks, and coordinator orchestration.
- [x] 8.4 Update readiness or architecture docs to describe the new agent runtime boundaries and operational expectations.









