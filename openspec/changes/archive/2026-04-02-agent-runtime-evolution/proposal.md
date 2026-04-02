## Why

SenClaw already has persistent runs, approvals, tools, and runtime isolation, but its agent model is still closer to single-run execution than long-lived, orchestrated agent work. We now have enough infrastructure to adopt the most valuable Claude Code patterns: a unified runtime, explicit subagent isolation, resumable background agents, tool-level concurrency rules, and data-driven agent definitions.

## What Changes

- Introduce a unified agent runtime model so foreground runs and subagents reuse the same execution loop, tool orchestration, and permission pipeline.
- Add an explicit subagent context cloning boundary that controls which runtime state is isolated, inherited, or overridden.
- Add resumable background agent tasks backed by transcript and metadata persistence, including resume and send-message flows.
- Add tool concurrency declarations so orchestration can safely batch concurrency-safe tools while serializing unsafe ones.
- Add a data-driven agent definition system that configures tools, model, effort, isolation, permissions, and optional background behavior without hardcoding agent classes.
- Add a constrained coordinator mode that combines prompt policy with a reduced tool surface for multi-agent delegation.

## Capabilities

### New Capabilities
- `unified-agent-runtime`: Main runs and subagents share one runtime contract and one execution loop.
- `subagent-context-isolation`: Subagents receive cloned runtime context with explicit sharing and isolation rules.
- `resumable-agent-tasks`: Background agents persist transcript and metadata, support resume, and accept follow-up messages.
- `tool-concurrency-policy`: Tools declare concurrency safety and orchestration respects those declarations.
- `data-driven-agent-definitions`: Agents are loaded from declarative definitions instead of being hardcoded in runtime logic.
- `constrained-coordinator-mode`: Coordinator-style orchestration uses both role instructions and runtime tool filtering.

### Modified Capabilities

None.

## Impact

- Affected code: `apps/agent-runner`, `apps/gateway`, `apps/tool-runner-host`, `packages/protocol`, `packages/storage`, CLI/Web surfaces for agent task management.
- Affected systems: run lifecycle, task persistence, permission handling, tool orchestration, agent configuration, and background execution UX.
- New storage impact: persisted agent transcripts, task metadata, and resumable message queues.
- New API impact: background agent lifecycle, resume/send-message endpoints, and agent definition loading/validation.
