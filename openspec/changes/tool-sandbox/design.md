# Tool Sandbox — Design Document

## Overview

Tool Sandbox provides secure isolation for tool execution, preventing malicious or buggy tools from compromising the agent runner or host system. It uses process isolation, resource limits, filesystem restrictions, and network controls.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Agent Runner Process                      │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Tool Executor                                        │  │
│  │  1. Receive tool call from LLM                        │  │
│  │  2. Validate tool exists                              │  │
│  │  3. Check if tool requires sandboxing                 │  │
│  │  4. Spawn sandbox process                             │  │
│  │  5. Send tool code + args via IPC                     │  │
│  │  6. Wait for result (with timeout)                    │  │
│  │  7. Return result to LLM                              │  │
│  └───────────────────────────────────────────────────────┘  │
│                          │                                   │
│                          ▼ spawn child process               │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Sandbox Process (isolated)                           │  │
│  │  - Limited CPU/memory                                 │  │
│  │  - Restricted filesystem access                       │  │
│  │  - Network blocked (optional allow-list)              │  │
│  │  - Timeout enforcement                                │  │
│  │  - Crash isolation                                    │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Isolation Levels

### Level 0: No Isolation (Default)

- Tool runs in agent runner process
- No resource limits
- Full filesystem and network access
- **Use for**: Trusted built-in tools (echo, calculator)

### Level 1: Process Isolation (Node.js)

- Tool runs in child process (`child_process.fork`)
- CPU and memory limits via `ulimit` (Linux) or job objects (Windows)
- Timeout enforcement
- Crash isolation (child crash doesn't kill parent)
- **Use for**: User-provided tools, untrusted code

### Level 2: Filesystem Sandbox (Node.js + chroot/jail)

- Level 1 + restricted filesystem access
- Read-only root filesystem
- Writable temp directory only
- **Use for**: Tools that need file I/O but shouldn't access sensitive files

### Level 3: Network Control (Node.js + iptables/firewall)

- Level 2 + network restrictions
- Block all network by default
- Optional allow-list for specific domains/IPs
- **Use for**: Tools that need controlled internet access

### Level 4: Full Isolation (Rust Sandbox Runner)

- Custom Rust binary with seccomp/AppArmor (Linux)
- Maximum security, minimal attack surface
- **Use for**: Production deployments, high-security environments

## Tool Metadata

Each tool declares its required isolation level:

```typescript
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: ToolParameters;
  execute: (args: unknown) => Promise<unknown>;
  sandbox?: {
    level: 0 | 1 | 2 | 3 | 4;
    timeout?: number; // milliseconds, default 30000
    maxMemory?: number; // MB, default 512
    maxCpu?: number; // percentage, default 100
    allowNetwork?: boolean; // default false
    allowedDomains?: string[]; // if allowNetwork=true
    allowedPaths?: string[]; // readable paths
  };
}
```

## Process Isolation (Level 1)

### Implementation

```typescript
import { fork } from 'node:child_process';
import type { ToolDefinition } from '@senclaw/protocol';

export async function executeSandboxed(
  tool: ToolDefinition,
  args: unknown
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timeout = tool.sandbox?.timeout || 30000;

    // Spawn child process
    const child = fork(
      require.resolve('./sandbox-worker.js'),
      [],
      {
        stdio: 'pipe',
        timeout,
        env: {
          ...process.env,
          NODE_ENV: 'sandbox',
        },
      }
    );

    let timeoutId: NodeJS.Timeout;

    // Set timeout
    timeoutId = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`Tool execution timeout after ${timeout}ms`));
    }, timeout);

    // Send tool code and args
    child.send({
      type: 'execute',
      toolCode: tool.execute.toString(),
      args,
    });

    // Receive result
    child.on('message', (message: any) => {
      clearTimeout(timeoutId);
      if (message.type === 'result') {
        resolve(message.result);
      } else if (message.type === 'error') {
        reject(new Error(message.error));
      }
    });

    // Handle errors
    child.on('error', (error) => {
      clearTimeout(timeoutId);
      reject(error);
    });

    child.on('exit', (code, signal) => {
      clearTimeout(timeoutId);
      if (code !== 0 && code !== null) {
        reject(new Error(`Tool process exited with code ${code}`));
      }
      if (signal) {
        reject(new Error(`Tool process killed by signal ${signal}`));
      }
    });
  });
}
```

### Sandbox Worker

```typescript
// sandbox-worker.js
process.on('message', async (message: any) => {
  if (message.type === 'execute') {
    try {
      // Reconstruct function from string
      const toolFn = eval(`(${message.toolCode})`);

      // Execute tool
      const result = await toolFn(message.args);

      // Send result back
      process.send!({ type: 'result', result });
      process.exit(0);
    } catch (error) {
      process.send!({
        type: 'error',
        error: error instanceof Error ? error.message : String(error),
      });
      process.exit(1);
    }
  }
});
```

## Resource Limits

### Linux (ulimit)

```typescript
import { spawn } from 'node:child_process';

function spawnWithLimits(command: string, args: string[], limits: ResourceLimits) {
  const ulimitArgs = [
    '-v', String(limits.maxMemory * 1024), // Virtual memory (KB)
    '-t', String(Math.ceil(limits.timeout / 1000)), // CPU time (seconds)
    '-f', '10240', // Max file size (10MB)
    '-n', '256', // Max open files
  ];

  return spawn('sh', [
    '-c',
    `ulimit ${ulimitArgs.join(' ')} && ${command} ${args.join(' ')}`,
  ]);
}
```

### Windows (Job Objects)

```typescript
import { spawn } from 'node:child_process';

function spawnWithJobObject(command: string, args: string[], limits: ResourceLimits) {
  // Create job object via PowerShell
  const psScript = `
    $job = [Windows.System.Diagnostics.ProcessDiagnosticInfo]::CreateJobObject()
    $job.SetLimits(
      [Windows.System.Diagnostics.JobObjectLimitFlags]::ProcessMemory,
      ${limits.maxMemory * 1024 * 1024}
    )
    Start-Process -FilePath "${command}" -ArgumentList "${args.join(' ')}" -NoNewWindow
  `;

  return spawn('powershell', ['-Command', psScript]);
}
```

## Filesystem Sandbox (Level 2)

### Linux (chroot)

```typescript
import { spawn } from 'node:child_process';
import { mkdtempSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function createChrootEnvironment(): string {
  // Create temp directory
  const sandboxRoot = mkdtempSync(join(tmpdir(), 'senclaw-sandbox-'));

  // Copy minimal Node.js runtime
  cpSync('/usr/bin/node', join(sandboxRoot, 'node'));
  cpSync('/lib/x86_64-linux-gnu', join(sandboxRoot, 'lib'), { recursive: true });

  // Create writable temp directory
  mkdirSync(join(sandboxRoot, 'tmp'));

  return sandboxRoot;
}

function spawnInChroot(sandboxRoot: string, script: string) {
  return spawn('chroot', [sandboxRoot, '/node', script]);
}
```

### Cross-Platform (Restricted Paths)

```typescript
import { access, constants } from 'node:fs/promises';

async function validatePath(requestedPath: string, allowedPaths: string[]): Promise<boolean> {
  const resolved = path.resolve(requestedPath);

  // Check if path is within allowed directories
  const isAllowed = allowedPaths.some(allowed =>
    resolved.startsWith(path.resolve(allowed))
  );

  if (!isAllowed) {
    throw new Error(`Access denied: ${requestedPath}`);
  }

  return true;
}

// Wrap fs functions
const sandboxedFs = {
  readFile: async (path: string, ...args: any[]) => {
    await validatePath(path, allowedPaths);
    return fs.readFile(path, ...args);
  },
  writeFile: async (path: string, ...args: any[]) => {
    await validatePath(path, allowedPaths);
    return fs.writeFile(path, ...args);
  },
};
```

## Network Control (Level 3)

### Linux (iptables)

```typescript
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

async function setupNetworkIsolation(pid: number, allowedDomains: string[]) {
  // Block all outbound traffic for this process
  await execAsync(`iptables -A OUTPUT -m owner --pid-owner ${pid} -j DROP`);

  // Allow specific domains
  for (const domain of allowedDomains) {
    const { stdout } = await execAsync(`dig +short ${domain}`);
    const ips = stdout.trim().split('\n');

    for (const ip of ips) {
      await execAsync(
        `iptables -I OUTPUT -m owner --pid-owner ${pid} -d ${ip} -j ACCEPT`
      );
    }
  }
}

async function cleanupNetworkIsolation(pid: number) {
  await execAsync(`iptables -D OUTPUT -m owner --pid-owner ${pid} -j DROP`);
}
```

### Cross-Platform (HTTP Proxy)

```typescript
import { Agent } from 'node:http';

class RestrictedAgent extends Agent {
  constructor(private allowedDomains: string[]) {
    super();
  }

  createConnection(options: any, callback: any) {
    const hostname = options.hostname || options.host;

    if (!this.allowedDomains.includes(hostname)) {
      callback(new Error(`Network access denied: ${hostname}`));
      return;
    }

    return super.createConnection(options, callback);
  }
}

// Inject into sandbox environment
global.fetch = new Proxy(global.fetch, {
  apply(target, thisArg, args) {
    const url = new URL(args[0]);
    if (!allowedDomains.includes(url.hostname)) {
      throw new Error(`Network access denied: ${url.hostname}`);
    }
    return Reflect.apply(target, thisArg, args);
  },
});
```

## Rust Sandbox Runner (Level 4)

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Node.js Agent Runner                                        │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  spawn("senclaw-sandbox", ["--tool", "my-tool.js"])   │ │
│  └────────────────────────────────────────────────────────┘ │
└──────────────────────────┬───────────────────────────────────┘
                           │ stdin/stdout
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  Rust Sandbox Runner (senclaw-sandbox)                       │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  1. Parse arguments                                    │ │
│  │  2. Set up seccomp filter (Linux)                      │ │
│  │  3. Set resource limits (rlimit)                       │ │
│  │  4. Drop privileges (setuid)                           │ │
│  │  5. Execute tool in isolated environment               │ │
│  │  6. Return result via stdout                           │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Rust Implementation (Minimal)

```rust
// crates/sandbox/src/main.rs
use std::process::{Command, Stdio};
use std::time::Duration;

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let tool_script = &args[1];

    // Set resource limits
    #[cfg(target_os = "linux")]
    set_rlimits();

    // Set up seccomp filter
    #[cfg(target_os = "linux")]
    setup_seccomp();

    // Execute tool
    let output = Command::new("node")
        .arg(tool_script)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("Failed to spawn tool process");

    // Wait with timeout
    let result = wait_with_timeout(output, Duration::from_secs(30));

    match result {
        Ok(output) => {
            println!("{}", String::from_utf8_lossy(&output.stdout));
        }
        Err(e) => {
            eprintln!("Tool execution failed: {}", e);
            std::process::exit(1);
        }
    }
}

#[cfg(target_os = "linux")]
fn set_rlimits() {
    use libc::{setrlimit, rlimit, RLIMIT_AS, RLIMIT_CPU};

    unsafe {
        // Limit virtual memory to 512MB
        let mem_limit = rlimit {
            rlim_cur: 512 * 1024 * 1024,
            rlim_max: 512 * 1024 * 1024,
        };
        setrlimit(RLIMIT_AS, &mem_limit);

        // Limit CPU time to 30 seconds
        let cpu_limit = rlimit {
            rlim_cur: 30,
            rlim_max: 30,
        };
        setrlimit(RLIMIT_CPU, &cpu_limit);
    }
}

#[cfg(target_os = "linux")]
fn setup_seccomp() {
    use seccomp::*;

    let mut ctx = Context::default(Action::Allow).unwrap();

    // Block dangerous syscalls
    ctx.add_rule(Rule::new(Syscall::execve, Action::Errno(1))).unwrap();
    ctx.add_rule(Rule::new(Syscall::fork, Action::Errno(1))).unwrap();
    ctx.add_rule(Rule::new(Syscall::clone, Action::Errno(1))).unwrap();

    ctx.load().unwrap();
}
```

## Configuration

### Tool-Level Configuration

```typescript
const myTool: ToolDefinition = {
  name: 'fetch-url',
  description: 'Fetch content from URL',
  parameters: { url: { type: 'string' } },
  execute: async ({ url }) => {
    const response = await fetch(url);
    return response.text();
  },
  sandbox: {
    level: 3, // Network control
    timeout: 10000,
    maxMemory: 256,
    allowNetwork: true,
    allowedDomains: ['api.example.com'],
  },
};
```

### Global Configuration

```bash
# Default sandbox level for all tools
SENCLAW_SANDBOX_LEVEL=1

# Default timeout (ms)
SENCLAW_SANDBOX_TIMEOUT=30000

# Default memory limit (MB)
SENCLAW_SANDBOX_MAX_MEMORY=512

# Enable Rust sandbox runner
SENCLAW_SANDBOX_USE_RUST=false
```

## Error Handling

### Timeout

```typescript
try {
  const result = await executeSandboxed(tool, args);
} catch (error) {
  if (error.message.includes('timeout')) {
    return {
      error: 'TOOL_TIMEOUT',
      message: `Tool execution exceeded ${tool.sandbox?.timeout}ms`,
    };
  }
}
```

### Memory Limit

```typescript
child.on('exit', (code, signal) => {
  if (signal === 'SIGKILL') {
    reject(new Error('Tool killed (likely memory limit exceeded)'));
  }
});
```

### Crash

```typescript
child.on('error', (error) => {
  logger.error({ error, tool: tool.name }, 'Tool process crashed');
  reject(new Error(`Tool crashed: ${error.message}`));
});
```

## Testing

### Unit Tests

```typescript
describe('Tool Sandbox', () => {
  it('executes tool in sandbox', async () => {
    const tool: ToolDefinition = {
      name: 'test',
      execute: async ({ x }) => x * 2,
      sandbox: { level: 1 },
    };

    const result = await executeSandboxed(tool, { x: 5 });
    expect(result).toBe(10);
  });

  it('enforces timeout', async () => {
    const tool: ToolDefinition = {
      name: 'slow',
      execute: async () => {
        await new Promise(resolve => setTimeout(resolve, 60000));
      },
      sandbox: { level: 1, timeout: 1000 },
    };

    await expect(executeSandboxed(tool, {})).rejects.toThrow('timeout');
  });

  it('isolates crashes', async () => {
    const tool: ToolDefinition = {
      name: 'crash',
      execute: async () => {
        process.exit(1);
      },
      sandbox: { level: 1 },
    };

    await expect(executeSandboxed(tool, {})).rejects.toThrow('exited with code 1');

    // Parent process should still be alive
    expect(process.pid).toBeTruthy();
  });
});
```

## Performance Impact

| Isolation Level | Overhead | Use Case |
|-----------------|----------|----------|
| Level 0 | 0ms | Trusted tools |
| Level 1 | ~50ms | Process spawn |
| Level 2 | ~100ms | + Filesystem setup |
| Level 3 | ~150ms | + Network rules |
| Level 4 | ~200ms | + Rust sandbox |

## Migration Path

### Phase 1: Process Isolation (Level 1)
- Implement child process spawning
- Add timeout enforcement
- Test with existing tools

### Phase 2: Resource Limits
- Add CPU/memory limits (Linux)
- Add Windows job objects
- Monitor resource usage

### Phase 3: Filesystem Sandbox (Level 2)
- Implement path validation
- Add chroot support (Linux)
- Test file I/O tools

### Phase 4: Network Control (Level 3)
- Implement domain allow-list
- Add iptables rules (Linux)
- Test HTTP tools

### Phase 5: Rust Sandbox (Level 4)
- Build Rust sandbox runner
- Add seccomp filters
- Deploy to production
