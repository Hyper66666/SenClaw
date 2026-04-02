## Context

SenClaw already has core pieces that many agent systems lack: persistent runs, approval workflows, managed shell and file tools, connector workers, and background services. What it does not yet have is a coherent model for long-lived agents that can be started, resumed, messaged, and orchestrated without splitting the runtime into separate code paths.

The Claude Code source and the accompanying analysis point to a small set of patterns with disproportionate value: subagents reusing the same main loop, explicit context cloning, task-backed background agents, tool-level concurrency contracts, and data-driven agent definitions. These align well with SenClaw's current architecture and can be layered on top of the existing run/task/storage model without importing Anthropic-specific product complexity.

## Goals / Non-Goals

**Goals:**
- Reuse SenClaw's existing execution loop for both direct runs and subagents.
- Define one explicit boundary for what subagents inherit versus isolate.
- Persist enough state for background agents to resume and receive additional messages.
- Make tool concurrency a first-class declaration on tool definitions and orchestration.
- Represent agent types as validated definitions rather than hardcoded branches.
- Add a coordinator mode that is constrained by both prompt policy and runtime tool filtering.

**Non-Goals:**
- Reproduce Claude Code's full UI, feature-flag, analytics, or internal remote-control stack.
- Implement every possible agent backend such as tmux, iTerm, or remote panes in this change.
- Add per-agent MCP injection in the first pass unless needed by the definition model.
- Build a complex general scheduler for multi-agent planning before the core lifecycle is stable.

## Decisions

### 1. Reuse one runtime instead of building a separate subagent executor

SenClaw SHALL extend the existing run execution loop to support subagent invocation through a cloned runtime context. We will not create a second "mini agent runtime" for delegated work because that would immediately create drift in tools, approvals, recovery, and observability.

Alternative considered:
- Build a lightweight subagent executor around model-call-plus-tools.
- Rejected because it is cheaper short term but would fork behavior and increase maintenance burden.

### 2. Introduce an explicit subagent context factory

SenClaw SHALL centralize subagent inheritance rules in a single context cloning function. The factory will decide how messages, abort controllers, app state setters, permission context, tool-decision caches, and response budgets are shared or isolated.

Alternative considered:
- Let each caller manually assemble subagent context.
- Rejected because it spreads hidden coupling across runtime code and makes isolation rules impossible to reason about.

### 3. Model background agents as resumable persisted tasks

Background agents SHALL be stored as task-backed execution units with transcript, metadata, status, pending messages, and selected agent definition. Resume and send-message operations SHALL restore the same runtime contract instead of starting a fresh run.

Alternative considered:
- Persist only final outputs and re-create context loosely on follow-up.
- Rejected because it breaks continuity, makes tool state inconsistent, and weakens user trust in long-running agents.

### 4. Put concurrency policy on tools, not on ad hoc call sites

Tool definitions SHALL declare whether they are concurrency-safe. Orchestration SHALL partition tool calls into safe concurrent batches and ordered serial execution. Context-modifying tools SHALL stay serialized by default.

Alternative considered:
- Hardcode read tools as concurrent and write tools as serial.
- Rejected because it becomes inaccurate as tools evolve and does not reflect tool-specific safety constraints.

### 5. Move agent types to validated definitions

Agent configuration SHALL be loaded from declarative definitions with fields for model, tools, skills, permission mode, max turns, isolation, background support, and coordinator eligibility. Runtime logic should consume validated definitions rather than branching on hardcoded agent names.

Alternative considered:
- Keep a small built-in enum and add more agent-specific code paths over time.
- Rejected because it blocks extension and makes product growth increasingly brittle.

### 6. Constrain coordinator mode in both prompt and runtime

Coordinator mode SHALL pair an orchestration-specific system prompt with a reduced tool surface. The coordinator can delegate, inspect worker status, and communicate with workers, but it should not retain the same unrestricted tool pool as a direct execution agent.

Alternative considered:
- Use only prompt instructions to keep the coordinator from overreaching.
- Rejected because prompt-only discipline is too weak for stable multi-agent operation.

## Risks / Trade-offs

- **[Risk] Runtime reuse increases coupling to the current execution loop** -> Mitigation: introduce the new abstractions as adapters around the existing loop rather than rewriting it wholesale.
- **[Risk] Resume semantics can become fragile if transcript persistence is partial** -> Mitigation: persist transcript and metadata atomically and validate required fields before resuming.
- **[Risk] Background agents can create zombie work without lifecycle controls** -> Mitigation: persist status transitions, expose explicit stop/resume APIs, and surface failed resume reasons.
- **[Risk] Concurrency declarations can be wrong for some tools** -> Mitigation: default to serialized execution unless a tool explicitly opts into concurrency safety.
- **[Risk] Data-driven agent definitions can become a dumping ground for unsupported flags** -> Mitigation: define a strict schema and reject unknown or incompatible combinations early.
- **[Risk] Coordinator mode can still generate poor plans** -> Mitigation: keep the first version narrow, with clear runtime restrictions and explicit notification/resume flows.

## Migration Plan

1. Introduce protocol and storage structures for agent definitions, background transcripts, task metadata, and concurrency declarations.
2. Refactor the agent runner so the existing execution loop can run with a cloned runtime context.
3. Add background agent persistence and resume/send-message flows behind new APIs.
4. Add data-driven agent loading and migrate the existing default agent configuration into the new definition format.
5. Add coordinator mode with constrained tools after the core lifecycle works end to end.
6. Roll out with one built-in delegated agent path first; keep a fallback to direct execution if subagent startup fails.

Rollback strategy:
- Disable background/resume entrypoints and coordinator mode.
- Continue using direct foreground execution with the pre-existing run lifecycle.
- Preserve persisted transcripts for later migration or replay.

## Open Questions

- Should per-agent MCP server injection be part of the first definition schema or deferred to a follow-up change?
- Should background agent transcript persistence reuse the current run message tables or introduce dedicated agent transcript tables?
- How much of agent lifecycle management should be exposed in Web versus CLI in the first rollout?
