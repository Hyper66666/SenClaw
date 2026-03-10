# Windows Local Validation

Windows is a first-class development platform for Senclaw, but not the primary production packaging target.

## Expected Workflow

1. Open PowerShell in the repository root.
2. Run the bootstrap wrapper:
   - `powershell -ExecutionPolicy Bypass -File .\scripts\bootstrap.windows.ps1`
3. Start the dev stack:
   - `pnpm run dev`
4. In another terminal, validate the local service endpoints:
   - `http://localhost:4100` for `gateway`
   - `http://localhost:4173` for `web`
   - `http://localhost:4200` for `agent-runner`
   - `http://localhost:4300` for `connector-worker`
   - `http://localhost:4400` for `tool-runner-host`
   - `http://localhost:4500` for `scheduler`
5. Run the workspace checks before handing work off:
   - `pnpm run verify`
   - `pnpm run test`
   - `pnpm run test:integration`

## Current Limitations

- Production deployment packaging is Linux-first. There is no Windows service wrapper, NSSM setup, or MSI packaging in v1.
- Use PowerShell for documented commands; Bash-on-Windows variants are not part of the supported path.
- If a future Rust crate is added under `native/`, validate it with `cargo fmt --check` and `cargo clippy --all-targets --all-features` from PowerShell.