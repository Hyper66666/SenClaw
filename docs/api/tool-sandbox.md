# Tool Sandbox

Senclaw can run tools in isolated child processes with optional filesystem and network restrictions.

## Current Readiness State

Locally verified today:

- `level: 0` through `level: 3` behavior is covered by unit and integration tests
- the host integrates a `level: 4` Rust-runner contract path
- Windows `cargo build --release --manifest-path native/sandbox-runner/Cargo.toml` was revalidated locally on March 12, 2026
- the unit suite covers both the missing-runner error path and the CLI contract against a real Rust binary when the binary is present locally
- CI includes an explicit release build step for `native/sandbox-runner`

Not yet release-closed:

- dedicated Linux `cargo build --release` evidence recorded for the current release-alignment change
- binary-backed validation still needs a completed Linux verification run before cross-platform readiness can be claimed

## Isolation Levels

- `level: 0`: no sandboxing, run in-process
- `level: 1`: child-process isolation with timeout, memory limit, and CPU budget handling
- `level: 2`: level 1 plus an ephemeral working directory and path restrictions
- `level: 3`: level 2 plus network blocking or host allow-list rules
- `level: 4`: Rust sandbox runner contract path

## Tool Definition

```ts
const myTool = {
  name: "fetch-status",
  description: "Checks an internal status endpoint",
  inputSchema: z.object({}),
  sandbox: {
    level: 3,
    timeout: 5_000,
    maxMemory: 128,
    allowNetwork: true,
    allowedDomains: ["status.internal.example.com"],
  },
};
```

## Supported Options

- `level`
  - chooses the isolation mode
  - default: `0`
- `timeout`
  - maximum wall-clock execution time in milliseconds
- `maxMemory`
  - approximate V8 heap limit in MB for the sandboxed child process
- `maxCpu`
  - average CPU budget as a percentage of one core for `level >= 1`
- `allowNetwork`
  - default: `false`
  - when `false`, outbound `fetch`, `http`, `https`, `net`, and `tls` calls are blocked
- `allowedDomains`
  - host allow-list used when `allowNetwork: true`
- `allowedPaths`
  - extra read-only paths for `level >= 2`

## Filesystem Behavior

For `level >= 2`, each tool execution gets its own temp directory.

- the child-process `cwd` is set to that temp directory
- relative writes land inside that temp directory
- reads are allowed from the temp directory and any configured `allowedPaths`
- writes are allowed only inside the temp directory
- the temp directory is deleted after the tool exits

## Network Behavior

For `level >= 3`, Senclaw applies runtime network guards inside the sandboxed child process.

- `allowNetwork: false` blocks outbound requests
- `allowNetwork: true` with `allowedDomains` restricts outbound traffic to the listed hosts
- host matching is exact

## Failure Semantics

Sandbox failures are returned as normal tool errors and do not crash the host process.

Current failure classes covered by tests:

- timeout
- memory exhaustion
- CPU budget exceeded
- process crash
- blocked network access
- blocked filesystem access

## Native Runner Prerequisites

Windows:

- Rust toolchain with the MSVC target
- Visual Studio Build Tools or equivalent MSVC linker environment

Linux:

- Rust toolchain with the GNU target
- standard C/C++ build tooling required by the host linker

Build command:

```bash
cargo build --manifest-path native/sandbox-runner/Cargo.toml
```

Release build command:

```bash
cargo build --release --manifest-path native/sandbox-runner/Cargo.toml
```

## Native Release Verification Checklist

Windows:

1. ensure the Rust MSVC toolchain is installed
2. run `cargo build --release --manifest-path native/sandbox-runner/Cargo.toml`
3. run the tool-host test suite or the dedicated level 4 integration path against the built binary

Linux:

1. ensure the Rust GNU toolchain plus system linker prerequisites are installed
2. run `cargo build --release --manifest-path native/sandbox-runner/Cargo.toml`
3. run the same binary-backed level 4 verification path and record the result

Current recorded evidence:

- Windows release build: passed on March 12, 2026
- Linux release build: not yet recorded

## Security Caveat

The current TypeScript sandbox is a practical containment layer, not a hardened OS boundary.

Do not claim full native sandbox readiness until binary-backed validation has been recorded on both supported platforms.
