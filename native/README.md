# Rust Boundary Component Conventions

Rust is reserved for boundary components such as sandbox runners, process supervisors, and native execution helpers.

The ownership rules that decide when Rust is allowed live in `docs/development/module-ownership.md`. Read that document before proposing a crate under `native/`.

## Toolchain

- Use the stable toolchain defined in `rust-toolchain.toml`.
- Format with `cargo fmt`.
- Lint with `cargo clippy --all-targets --all-features`.
- Keep Rust crates under `native/` unless a later OpenSpec change explicitly changes the layout.

## Expected Layout

```text
native/
  README.md
  <crate-name>/
    Cargo.toml
    src/
      lib.rs or main.rs
    tests/
```

Each crate must document:

- the problem it solves
- the owning TypeScript app that invokes it
- the supported Windows/Linux execution model
- the JSON or FFI contract exposed to the TypeScript workspace

## Interface Contract

The default integration pattern is a narrow CLI boundary:

1. TypeScript app launches the Rust binary as a child process.
2. Request payloads are passed through stdin or arguments.
3. Structured JSON responses are returned on stdout.
4. Errors are returned on stderr plus a non-zero exit code.

Direct FFI is allowed only when an OpenSpec design explicitly justifies it. If FFI is used, the crate must still keep the interface narrow and versioned.

## CI and Local Verification

Every Rust crate under `native/` must be buildable and verifiable on Windows and Linux.

Minimum commands:

- `cargo fmt --check`
- `cargo clippy --all-targets --all-features`
- `cargo test`

The workspace CI pipeline checks for any `.rs` files under `native/`. If no Rust sources exist yet, the Rust verification step is skipped cleanly.

## Scope

Do not introduce Rust for general gateway, scheduler, connector, or web orchestration code without an approved OpenSpec design update.