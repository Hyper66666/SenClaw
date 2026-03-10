# CLI Tool — Design Document

## Overview

The Senclaw CLI provides a command-line interface for interacting with the Senclaw API. It enables developers to manage agents, submit tasks, monitor runs, and configure the CLI from the terminal.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    CLI (packages/cli)                        │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Commander.js (Command Parser)                        │  │
│  │  - senclaw agent create                               │  │
│  │  - senclaw task submit <agent-id>                     │  │
│  │  - senclaw run logs <run-id>                          │  │
│  └───────────────────────────────────────────────────────┘  │
│                          ↓                                   │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  API Client (HTTP)                                    │  │
│  │  - Reads config from ~/.senclawrc                     │  │
│  │  - Adds Authorization header                          │  │
│  │  - Handles errors, retries                            │  │
│  └───────────────────────────────────────────────────────┘  │
│                          ↓                                   │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Output Formatter                                     │  │
│  │  - Table (agent list, run list)                       │  │
│  │  - JSON (--json flag)                                 │  │
│  │  - Spinner (loading states)                           │  │
│  │  - Colors (success, error, warning)                   │  │
│  └───────────────────────────────────────────────────────┘  │
└──────────────────────────┬───────────────────────────────────┘
                           │ HTTPS
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    Gateway API                               │
│  /api/v1/agents, /api/v1/tasks, /api/v1/runs               │
└─────────────────────────────────────────────────────────────┘
```

## Configuration

### Config File Location

- **Linux/macOS**: `~/.senclawrc`
- **Windows**: `%USERPROFILE%\.senclawrc`

### Config Format (JSON)

```json
{
  "gatewayUrl": "https://senclaw.example.com",
  "apiKey": "sk_abc123...",
  "defaultFormat": "table"
}
```

### Environment Variables

Override config file:

```bash
export SENCLAW_GATEWAY_URL=https://senclaw.example.com
export SENCLAW_API_KEY=sk_abc123...
```

## Commands

### Configuration Commands

#### `senclaw config set <key> <value>`

Set configuration value:

```bash
senclaw config set gatewayUrl https://senclaw.example.com
senclaw config set apiKey sk_abc123...
```

#### `senclaw config get <key>`

Get configuration value:

```bash
senclaw config get gatewayUrl
# Output: https://senclaw.example.com
```

#### `senclaw config list`

List all configuration:

```bash
senclaw config list
# Output:
# gatewayUrl: https://senclaw.example.com
# apiKey: sk_abc...xyz (masked)
```

### Agent Commands

#### `senclaw agent create`

Interactive agent creation:

```bash
senclaw agent create

? Agent name: My Agent
? System prompt: You are a helpful assistant
? Provider: openai
? Model: gpt-4
✓ Agent created: agent-abc123
```

**Non-interactive**:

```bash
senclaw agent create \
  --name "My Agent" \
  --prompt "You are a helpful assistant" \
  --provider openai \
  --model gpt-4
```

#### `senclaw agent list`

List all agents:

```bash
senclaw agent list

┌──────────────┬───────────┬──────────┬───────────┐
│ ID           │ Name      │ Provider │ Model     │
├──────────────┼───────────┼──────────┼───────────┤
│ agent-abc123 │ My Agent  │ openai   │ gpt-4     │
│ agent-def456 │ Assistant │ anthropic│ claude-3  │
└──────────────┴───────────┴──────────┴───────────┘
```

**JSON output**:

```bash
senclaw agent list --json
```

#### `senclaw agent get <id>`

Get agent details:

```bash
senclaw agent get agent-abc123

Agent: My Agent (agent-abc123)
Provider: openai
Model: gpt-4
System Prompt:
  You are a helpful assistant
Created: 2026-03-10T12:00:00Z
```

#### `senclaw agent delete <id>`

Delete agent:

```bash
senclaw agent delete agent-abc123

? Are you sure you want to delete agent "My Agent"? (y/N) y
✓ Agent deleted
```

**Skip confirmation**:

```bash
senclaw agent delete agent-abc123 --yes
```

### Task Commands

#### `senclaw task submit <agent-id>`

Submit task (interactive):

```bash
senclaw task submit agent-abc123

? Task input: What is 2+2?
✓ Task submitted
Run ID: run-xyz789
```

**Non-interactive**:

```bash
senclaw task submit agent-abc123 --input "What is 2+2?"
```

**From file**:

```bash
senclaw task submit agent-abc123 --input-file task.txt
```

**From stdin**:

```bash
echo "What is 2+2?" | senclaw task submit agent-abc123 --stdin
```

### Run Commands

#### `senclaw run get <run-id>`

Get run status:

```bash
senclaw run get run-xyz789

Run: run-xyz789
Agent: My Agent (agent-abc123)
Status: completed
Created: 2026-03-10T12:00:00Z
Completed: 2026-03-10T12:00:05Z
Duration: 5s
```

#### `senclaw run logs <run-id>`

Display run messages:

```bash
senclaw run logs run-xyz789

[user] What is 2+2?

[assistant] The answer is 4.
```

**Follow mode** (poll for updates):

```bash
senclaw run logs run-xyz789 --follow
```

**JSON output**:

```bash
senclaw run logs run-xyz789 --json
```

### Health Command

#### `senclaw health`

Check system health:

```bash
senclaw health

Gateway: ✓ Healthy
Storage: ✓ Healthy
```

## Implementation

### Project Structure

```
packages/cli/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts              ← Entry point, register commands
│   ├── commands/
│   │   ├── config.ts         ← Config commands
│   │   ├── agent.ts          ← Agent commands
│   │   ├── task.ts           ← Task commands
│   │   ├── run.ts            ← Run commands
│   │   └── health.ts         ← Health command
│   ├── lib/
│   │   ├── api-client.ts     ← HTTP client
│   │   ├── config.ts         ← Config management
│   │   ├── formatter.ts      ← Output formatting
│   │   └── prompts.ts        ← Interactive prompts
│   └── types/
│       └── index.ts          ← Type definitions
└── bin/
    └── senclaw               ← Executable script
```

### Entry Point

```typescript
#!/usr/bin/env node
// src/index.ts
import { Command } from 'commander';
import { registerAgentCommands } from './commands/agent';
import { registerTaskCommands } from './commands/task';
import { registerRunCommands } from './commands/run';
import { registerConfigCommands } from './commands/config';
import { registerHealthCommand } from './commands/health';

const program = new Command();

program
  .name('senclaw')
  .description('Senclaw CLI - Manage agents and tasks')
  .version('1.0.0');

registerConfigCommands(program);
registerAgentCommands(program);
registerTaskCommands(program);
registerRunCommands(program);
registerHealthCommand(program);

program.parse();
```

### API Client

```typescript
// src/lib/api-client.ts
import { loadConfig } from './config';

export class APIClient {
  private baseURL: string;
  private apiKey: string;

  constructor() {
    const config = loadConfig();
    this.baseURL = config.gatewayUrl || process.env.SENCLAW_GATEWAY_URL;
    this.apiKey = config.apiKey || process.env.SENCLAW_API_KEY;

    if (!this.baseURL) {
      throw new Error('Gateway URL not configured. Run: senclaw config set gatewayUrl <url>');
    }

    if (!this.apiKey) {
      throw new Error('API key not configured. Run: senclaw config set apiKey <key>');
    }
  }

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseURL}${path}`;

    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || `HTTP ${response.status}`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json();
  }

  // Agent methods
  async listAgents() {
    return this.request<Agent[]>('GET', '/api/v1/agents');
  }

  async getAgent(id: string) {
    return this.request<Agent>('GET', `/api/v1/agents/${id}`);
  }

  async createAgent(data: CreateAgent) {
    return this.request<Agent>('POST', '/api/v1/agents', data);
  }

  async deleteAgent(id: string) {
    return this.request<void>('DELETE', `/api/v1/agents/${id}`);
  }

  // Task methods
  async submitTask(agentId: string, input: string) {
    return this.request<Run>('POST', '/api/v1/tasks', { agentId, input });
  }

  // Run methods
  async getRun(id: string) {
    return this.request<Run>('GET', `/api/v1/runs/${id}`);
  }

  async getRunMessages(id: string) {
    return this.request<Message[]>('GET', `/api/v1/runs/${id}/messages`);
  }

  // Health
  async checkHealth() {
    return this.request<HealthResponse>('GET', '/health');
  }
}
```

### Config Management

```typescript
// src/lib/config.ts
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const CONFIG_PATH = join(homedir(), '.senclawrc');

export interface Config {
  gatewayUrl?: string;
  apiKey?: string;
  defaultFormat?: 'table' | 'json';
}

export function loadConfig(): Config {
  if (!existsSync(CONFIG_PATH)) {
    return {};
  }

  try {
    const content = readFileSync(CONFIG_PATH, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error('Failed to load config:', error);
    return {};
  }
}

export function saveConfig(config: Config): void {
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

export function setConfigValue(key: string, value: string): void {
  const config = loadConfig();
  config[key] = value;
  saveConfig(config);
}

export function getConfigValue(key: string): string | undefined {
  const config = loadConfig();
  return config[key];
}
```

### Output Formatting

```typescript
// src/lib/formatter.ts
import chalk from 'chalk';
import Table from 'cli-table3';

export function formatAgentTable(agents: Agent[]): string {
  const table = new Table({
    head: ['ID', 'Name', 'Provider', 'Model'],
    colWidths: [15, 20, 15, 15],
  });

  for (const agent of agents) {
    table.push([
      agent.id,
      agent.name,
      agent.provider.provider,
      agent.provider.model,
    ]);
  }

  return table.toString();
}

export function formatRunStatus(run: Run): string {
  const statusColors = {
    pending: chalk.yellow,
    running: chalk.blue,
    completed: chalk.green,
    failed: chalk.red,
  };

  const colorFn = statusColors[run.status] || chalk.white;
  return colorFn(run.status);
}

export function formatMessages(messages: Message[]): string {
  return messages.map(msg => {
    const role = chalk.bold(`[${msg.role}]`);
    const content = msg.content || JSON.stringify(msg.toolCalls || msg.toolResult);
    return `${role} ${content}\n`;
  }).join('\n');
}
```

### Interactive Prompts

```typescript
// src/lib/prompts.ts
import inquirer from 'inquirer';

export async function promptAgentCreate() {
  return inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: 'Agent name:',
      validate: (input) => input.length > 0 || 'Name is required',
    },
    {
      type: 'input',
      name: 'systemPrompt',
      message: 'System prompt:',
      validate: (input) => input.length > 0 || 'System prompt is required',
    },
    {
      type: 'list',
      name: 'provider',
      message: 'Provider:',
      choices: ['openai', 'anthropic'],
    },
    {
      type: 'input',
      name: 'model',
      message: 'Model:',
      default: (answers) => answers.provider === 'openai' ? 'gpt-4' : 'claude-3-opus-20240229',
    },
  ]);
}

export async function promptTaskInput() {
  const { input } = await inquirer.prompt([
    {
      type: 'input',
      name: 'input',
      message: 'Task input:',
      validate: (input) => input.length > 0 || 'Input is required',
    },
  ]);
  return input;
}

export async function promptConfirm(message: string): Promise<boolean> {
  const { confirmed } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirmed',
      message,
      default: false,
    },
  ]);
  return confirmed;
}
```

## Error Handling

### Network Errors

```typescript
try {
  const agents = await client.listAgents();
} catch (error) {
  if (error.code === 'ECONNREFUSED') {
    console.error(chalk.red('✗ Cannot connect to gateway'));
    console.error('  Check that the gateway is running and the URL is correct');
    process.exit(1);
  }
  throw error;
}
```

### Authentication Errors

```typescript
try {
  const agents = await client.listAgents();
} catch (error) {
  if (error.message.includes('401')) {
    console.error(chalk.red('✗ Authentication failed'));
    console.error('  Check your API key: senclaw config get apiKey');
    process.exit(1);
  }
  throw error;
}
```

### Validation Errors

```typescript
try {
  const agent = await client.createAgent(data);
} catch (error) {
  if (error.message.includes('VALIDATION_ERROR')) {
    console.error(chalk.red('✗ Validation failed'));
    console.error(`  ${error.message}`);
    process.exit(1);
  }
  throw error;
}
```

## Testing

### Unit Tests

```typescript
describe('API Client', () => {
  it('lists agents', async () => {
    fetchMock.mockResponseOnce(JSON.stringify([
      { id: 'agent-1', name: 'Test Agent' },
    ]));

    const client = new APIClient();
    const agents = await client.listAgents();

    expect(agents).toHaveLength(1);
    expect(agents[0].name).toBe('Test Agent');
  });

  it('handles authentication errors', async () => {
    fetchMock.mockResponseOnce('', { status: 401 });

    const client = new APIClient();

    await expect(client.listAgents()).rejects.toThrow('401');
  });
});
```

### Integration Tests

```typescript
describe('CLI Commands', () => {
  it('creates agent', async () => {
    const output = await execCLI([
      'agent', 'create',
      '--name', 'Test Agent',
      '--prompt', 'Test prompt',
      '--provider', 'openai',
      '--model', 'gpt-4',
    ]);

    expect(output).toContain('Agent created');
  });
});
```

## Distribution

### NPM Package

```json
{
  "name": "@senclaw/cli",
  "version": "1.0.0",
  "bin": {
    "senclaw": "./dist/index.js"
  },
  "files": [
    "dist"
  ],
  "dependencies": {
    "commander": "^11.0.0",
    "inquirer": "^9.0.0",
    "chalk": "^5.0.0",
    "cli-table3": "^0.6.0",
    "ora": "^7.0.0"
  }
}
```

### Installation

```bash
npm install -g @senclaw/cli
```

### Usage

```bash
senclaw --help
```

## Best Practices

1. **Mask API keys** in output (show only first/last 3 chars)
2. **Use spinners** for long operations
3. **Provide JSON output** for scripting (`--json` flag)
4. **Confirm destructive actions** (delete, unless `--yes`)
5. **Support stdin/file input** for automation
6. **Exit with proper codes** (0 = success, 1 = error)
7. **Color output** for better UX (but respect `NO_COLOR`)
8. **Show helpful errors** with suggestions
