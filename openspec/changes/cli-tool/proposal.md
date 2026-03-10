# CLI Tool

## Problem Statement

Users must interact with Senclaw via curl or HTTP clients. Need a dedicated CLI for:
- Agent management (create, list, delete)
- Task submission with interactive prompts
- Run monitoring with live updates
- Local development workflows

## Proposed Solution

Build `senclaw` CLI using Node.js with:
- **Commander.js** for command parsing
- **Inquirer.js** for interactive prompts
- **Ora** for spinners and progress
- **Chalk** for colored output

### Commands

```bash
senclaw agent create --name "My Agent" --prompt "You are helpful"
senclaw agent list
senclaw agent delete <id>
senclaw task submit <agent-id> --input "Hello"
senclaw run get <run-id>
senclaw run logs <run-id> --follow
senclaw health
```

## Dependencies

- Gateway REST API

## Timeline: 3-4 days
