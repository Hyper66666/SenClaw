# Agent Runtime

Senclaw now supports a shared agent runtime model for direct runs, background agent tasks, and coordinator-facing worker orchestration.

## Core Model

The current runtime is built around three ideas:

1. One execution loop
   Direct runs and delegated runs both use the same `executeRunRequest()` entrypoint in `@senclaw/agent-runner`.
2. Explicit subagent context cloning
   `createSubagentContext()` defines what state is isolated, shared, or overridden when a child runtime is created.
3. Persisted background agent tasks
   Long-running or resumable work is stored as task-backed state with transcript history and queued follow-up messages.

## Runtime Components

### Direct runs

Direct foreground runs still start through `/api/v1/tasks` and are stored in the `runs` and `messages` tables.

### Background agent tasks

Background tasks are stored across three persistence layers:

- `agent_tasks`: task status, metadata, selected agent, transcript cursor, active run link
- `agent_task_messages`: transcript history for the task
- `agent_task_pending_messages`: queued follow-up instructions waiting to be delivered

Gateway endpoints:

- `POST /api/v1/agent-tasks/background`
- `GET /api/v1/agent-tasks`
- `GET /api/v1/agent-tasks/:id`
- `GET /api/v1/agent-tasks/:id/messages`
- `POST /api/v1/agent-tasks/:id/messages`
- `POST /api/v1/agent-tasks/:id/resume`

CLI commands:

- `senclaw task background <agent-id>`
- `senclaw task bg-list`
- `senclaw task bg-get <task-id>`
- `senclaw task bg-logs <task-id>`
- `senclaw task bg-message <task-id>`
- `senclaw task bg-resume <task-id>`

Web console surfaces:

- `/agent-tasks`
- `/agent-tasks/:id`

## Declarative Agent Definitions

Agents now carry runtime fields beyond prompt/provider/tools:

- `effort`
- `isolation`
- `permissionMode`
- `mode`
- `maxTurns`
- `background`

These fields are available in the shared protocol and are persisted in SQLite.

Local definition sources currently supported:

- built-in agent definitions provided by the runtime
- `~/.senclaw/agents.json`
- `<workspace>/.senclaw/agents.json`

Override precedence is:

1. built-in
2. user config
3. workspace config

The default local runtime agent (`SenClaw Assistant`) is now expressed in the same declarative shape.

## Coordinator Mode

Coordinator mode is intentionally constrained.

Runtime behavior today:

- coordinator agents receive an augmented orchestration prompt
- coordinator agents are restricted to orchestration-safe tools only
- the built-in orchestration surface is the `agent_tasks.*` tool family

Current orchestration tools:

- `agent_tasks.spawn`
- `agent_tasks.list`
- `agent_tasks.get`
- `agent_tasks.resume`
- `agent_tasks.send_message`

## Tool Concurrency Policy

Tools can now declare concurrency behavior on their definitions:

- `concurrency.safe`
- `concurrency.cancelSiblingsOnFailure`

The `ToolRegistry` partitions calls into:

- concurrent batches for explicitly safe tools
- serialized execution for all others

Current defaults:

- safe read-style built-ins such as `echo`, `fs.read_text`, and `fs.read_dir` opt into concurrency
- write and shell tools remain serialized unless explicitly proven safe

## Current Boundaries

Implemented today:

- shared runtime entrypoint
- persisted background tasks
- transcript replay and follow-up queues
- declarative agent definitions with persisted runtime fields
- coordinator prompt and orchestration tool filtering
- tool-level concurrency batching

Still in progress:

- delegated subagent execution that is initiated automatically from agent reasoning, not just through explicit orchestration tools
- coordinator behavior tests that prove “answer directly vs delegate” policy at the higher orchestration layer
- final CLI/Web polish and broader operator docs
