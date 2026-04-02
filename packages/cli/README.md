# Senclaw CLI

Command-line interface for managing Senclaw agents, tasks, runs, and background agent tasks.

## Installation

```bash
# Install globally
pnpm install -g @senclaw/cli

# Or use from workspace
pnpm --filter @senclaw/cli build
pnpm link --global packages/cli
```

## Configuration

Configure the CLI to connect to your Senclaw gateway:

```bash
senclaw config set gatewayUrl http://localhost:4100
senclaw config set apiKey sk-your-api-key-here
```

Configuration is stored in `~/.senclawrc`

## Commands

### Agent Management

```bash
senclaw agent create
senclaw agent list
senclaw agent get <agent-id>
senclaw agent delete <agent-id>
```

### Foreground Tasks and Runs

```bash
senclaw task submit <agent-id> --input "Your task input here"
senclaw run get <run-id>
senclaw run logs <run-id>
senclaw run logs <run-id> --follow
```

### Background Agent Tasks

```bash
senclaw task background <agent-id> --input "Investigate the repository"
senclaw task bg-list
senclaw task bg-get <task-id>
senclaw task bg-logs <task-id>
senclaw task bg-message <task-id> --input "Continue with the second half"
senclaw task bg-resume <task-id>
```

These commands map to the same persisted background task lifecycle used by the gateway and web console.

### Health Check

```bash
senclaw health
```

## Development

```bash
pnpm --filter @senclaw/cli dev -- agent list
pnpm --filter @senclaw/cli build
```

## Notes

- interactive commands use editor prompts for long text input
- background task commands are operator-facing wrappers around `/api/v1/agent-tasks/*`
- errors are normalized through the shared protocol error parser so CLI messaging matches gateway/web semantics
