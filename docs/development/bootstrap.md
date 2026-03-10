# Bootstrap Guide

This repository supports exactly two operating systems for v1 development:

- Windows (PowerShell)
- Linux (POSIX shell)

macOS, iOS, Android, and other platforms are out of scope for this workflow.

## Canonical Commands

After the toolchain is installed, both supported platforms use the same root commands:

- `pnpm install`
- `pnpm run dev`
- `pnpm run lint`
- `pnpm run format`
- `pnpm run typecheck`
- `pnpm run test`
- `pnpm run test:integration`
- `pnpm run build`
- `pnpm run verify`
- `pnpm run package`
- `pnpm run auth:bootstrap-admin`

Platform-specific wrappers exist only for bootstrap because shell startup and dependency activation differ between PowerShell and POSIX shells.

The checked-in `.env` example files keep SQLite persistence disabled by default. Uncomment `SENCLAW_DB_URL=file:./senclaw.db` only when you want the gateway to persist agents and runs locally.

Authentication and audit settings are configurable with:

- `SENCLAW_RATE_LIMIT_ADMIN`
- `SENCLAW_RATE_LIMIT_USER`
- `SENCLAW_RATE_LIMIT_READONLY`
- `SENCLAW_AUDIT_LOG_RETENTION_DAYS`

## Windows (PowerShell)

1. Install Node.js 22.x.
   - Use the official MSI installer or a managed package source such as `winget`.
2. Verify the Node runtime:
   - `node --version`
3. Enable Corepack so the pinned pnpm version can be activated:
   - `corepack enable`
   - `corepack prepare pnpm@10.0.0 --activate`
4. Install the Rust stable toolchain:
   - Download and run `rustup-init.exe`
   - Confirm with `rustup show active-toolchain`
5. If you plan to enable SQLite persistence with `SENCLAW_DB_URL`, install Visual Studio Build Tools with the `Desktop development with C++` workload.
   - `better-sqlite3` is a native addon and may need local compilation on Windows.
6. From the repository root, run the bootstrap wrapper:
   - `powershell -ExecutionPolicy Bypass -File .\scripts\bootstrap.windows.ps1`
7. Start the local dev stack when needed:
   - `pnpm run dev`
8. Bootstrap a persistent admin key when you are preparing a local environment that uses SQLite:
   - `$env:SENCLAW_DB_URL='file:./senclaw.db'`
   - `pnpm run auth:bootstrap-admin`
9. Run the full local verification contract before proposing a change:
   - `pnpm run verify`
   - `pnpm run test`
   - `pnpm run test:integration`

## Linux (POSIX shell)

1. Install Node.js 22.x.
   - Prefer the official Node distribution or a maintained package source that can provide Node 22.x.
2. Verify the Node runtime:
   - `node --version`
3. Enable Corepack so the pinned pnpm version can be activated:
   - `corepack enable`
   - `corepack prepare pnpm@10.0.0 --activate`
4. Install the Rust stable toolchain:
   - `curl https://sh.rustup.rs -sSf | sh`
   - `rustup show active-toolchain`
5. From the repository root, run the bootstrap wrapper:
   - `bash ./scripts/bootstrap.linux.sh`
6. Start the local dev stack when needed:
   - `pnpm run dev`
7. Bootstrap a persistent admin key when you are preparing a local environment that uses SQLite:
   - `export SENCLAW_DB_URL=file:./senclaw.db`
   - `pnpm run auth:bootstrap-admin`
8. Run the full local verification contract before proposing a change:
   - `pnpm run verify`
   - `pnpm run test`
   - `pnpm run test:integration`

## Wrapper Behavior

- `scripts/bootstrap.windows.ps1`
  - Verifies `node`, `corepack`, and `rustup` are available.
  - Activates pnpm 10.
  - Runs `pnpm install`.
  - Seeds `.env` from `.env.example` when needed.
  - Runs `pnpm run verify` unless `-SkipVerify` is passed.
- `scripts/bootstrap.linux.sh`
  - Performs the same workflow with POSIX shell syntax.

These wrappers exist because command discovery, execution policy, and shell syntax differ between PowerShell and POSIX shells. Day-to-day development remains on the canonical `pnpm run ...` contract.
