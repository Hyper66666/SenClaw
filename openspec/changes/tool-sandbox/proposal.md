# Tool Sandbox Isolation

## Problem Statement

Tools currently execute in the same process as the agent runner, creating security and reliability risks:
- **No resource limits**: Tools can consume unlimited CPU/memory
- **No network isolation**: Tools can access any network resource
- **No filesystem isolation**: Tools can read/write any file
- **Crash propagation**: Tool crash kills entire agent runner
- **No timeout enforcement**: Tools can hang indefinitely

## Proposed Solution

Isolate tool execution in sandboxed environments using:
1. **Child processes** with resource limits (CPU, memory, timeout)
2. **Restricted filesystem access** (read-only, temp directory only)
3. **Network policies** (allow/deny lists)
4. **Rust-based sandbox runner** (optional, for maximum security)

### Core Capabilities

- **Process Isolation**: Each tool execution in separate process
- **Resource Limits**: CPU time, memory, file descriptors
- **Timeout Enforcement**: Kill process after configurable timeout
- **Filesystem Sandboxing**: chroot or mount namespace (Linux), temp directory (Windows)
- **Network Control**: Block all network by default, opt-in allow list
- **Crash Recovery**: Tool crash doesn't affect agent runner

### Technology Stack

- **Phase 1 (TypeScript)**: Node.js `child_process` with resource limits
- **Phase 2 (Rust)**: Custom sandbox runner with seccomp/AppArmor (Linux)

## Dependencies

- `tool-runner-host` (existing tool registry)

## Timeline: 6-8 days (Phase 1), 10-15 days (Phase 2)
