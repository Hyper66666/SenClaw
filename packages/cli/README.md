# Senclaw CLI

Command-line interface for managing Senclaw agents, tasks, and runs.

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
# Set gateway URL
senclaw config set gatewayUrl http://localhost:4100

# Set API key
senclaw config set apiKey sk-your-api-key-here

# View configuration
senclaw config get gatewayUrl
senclaw config get apiKey
```

Configuration is stored in `~/.senclawrc`

## Commands

### Agent Management

```bash
# Create a new agent (interactive)
senclaw agent create

# List all agents
senclaw agent list

# Get agent details
senclaw agent get <agent-id>

# Delete an agent
senclaw agent delete <agent-id>
```

### Task Submission

```bash
# Submit a task (interactive)
senclaw task submit <agent-id>

# Submit a task (non-interactive)
senclaw task submit <agent-id> --input "Your task input here"
```

### Run Management

```bash
# Get run status
senclaw run get <run-id>

# View run logs
senclaw run logs <run-id>

# Follow run logs in real-time
senclaw run logs <run-id> --follow
```

### Health Check

```bash
# Check system health
senclaw health
```

## Examples

### Create and use an agent

```bash
# 1. Configure CLI
senclaw config set gatewayUrl http://localhost:4100
senclaw config set apiKey sk-your-key

# 2. Create an agent
senclaw agent create
# Follow prompts to configure agent

# 3. List agents to get ID
senclaw agent list

# 4. Submit a task
senclaw task submit agent-id-here --input "Hello, world!"

# 5. Check run status
senclaw run get run-id-here

# 6. View logs
senclaw run logs run-id-here
```

### Monitor a running task

```bash
# Submit task and follow logs
senclaw task submit <agent-id> --input "Long running task"
# Note the run ID from output
senclaw run logs <run-id> --follow
```

## Development

```bash
# Run in development mode
pnpm --filter @senclaw/cli dev -- agent list

# Build
pnpm --filter @senclaw/cli build
```

## Error Handling

The CLI provides user-friendly error messages:

- Connection errors: "Cannot connect to Senclaw gateway. Make sure it's running."
- API errors: Displays the error message from the server
- Validation errors: Shows which fields are invalid

## Tips

- Use `--help` on any command to see available options
- The CLI uses colors to highlight important information
- Interactive prompts support editor mode for long text inputs
- Press Ctrl+C to cancel any operation
