> Release-alignment note: implementation tasks in this change are complete. Separate release evidence now exists for Windows native build validation and missing-runner UX under `production-readiness-alignment`, while Linux native validation remains pending there.

## Phase 1: Process Isolation (TypeScript)

- [x] 1.1 Implement `SandboxedToolRunner` class: spawn child process for each tool execution.
- [x] 1.2 Add resource limits: `maxMemory`, `maxCpu`, `timeout`.
- [x] 1.3 Implement IPC protocol: parent sends tool name + args, child executes and returns result.
- [x] 1.4 Handle process crashes: catch exit code, return error to agent.
- [x] 1.5 Add unit tests: successful execution, timeout, memory limit exceeded, crash.

## Phase 2: Filesystem Sandboxing

- [x] 2.1 Create temp directory for each execution.
- [x] 2.2 Set working directory to temp directory.
- [x] 2.3 Restrict file access: read-only for tool code, read-write for temp directory only.
- [x] 2.4 Clean up temp directory after execution.

## Phase 3: Network Control

- [x] 3.1 Add `allowNetwork` flag to tool definition (default: false).
- [x] 3.2 Block network access using environment variables or firewall rules.
- [x] 3.3 Add allow list for specific domains (e.g., `allowedDomains: ['api.example.com']`).

## Phase 4: Rust Sandbox Runner (Optional)

- [x] 4.1 Create `native/sandbox-runner` Rust crate.
- [x] 4.2 Implement seccomp filter (Linux) to restrict syscalls.
- [x] 4.3 Implement resource limits using cgroups (Linux) and rlimit.
- [x] 4.4 Expose CLI interface: stdin/stdout JSON protocol (SandboxRequest → SandboxResponse).
- [x] 4.5 Integrate with TypeScript tool runner: spawn Rust binary for level 4 tools.

## Testing

- [x] 5.1 Integration test: tool exceeds memory limit �?killed, error returned.
- [x] 5.2 Integration test: tool exceeds timeout �?killed, error returned.
- [x] 5.3 Integration test: tool crashes �?error returned, agent continues.
- [x] 5.4 Integration test: tool attempts network access �?blocked (if `allowNetwork: false`).

## Documentation

- [x] 6.1 Document sandbox configuration options.
- [x] 6.2 Add security best practices for tool development.





