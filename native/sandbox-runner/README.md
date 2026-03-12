# sandbox-runner

`sandbox-runner` is the Rust-owned boundary component for `apps/tool-runner-host`.

It exposes a narrow CLI contract:

1. TypeScript launches the binary as a child process.
2. A JSON request is passed on stdin.
3. The runner spawns a Node.js worker with OS-level hardening where available.
4. A JSON response is emitted on stdout.

Supported execution model:

- Windows: timeout and CPU monitoring from the Rust parent, plus the existing Node worker isolation.
- Linux: the same parent-side monitoring plus `setrlimit`, a best-effort seccomp deny-list, and best-effort cgroup v2 attachment when writable.