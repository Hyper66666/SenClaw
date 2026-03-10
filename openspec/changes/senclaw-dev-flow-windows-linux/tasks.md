## 1. Repository Foundation

- [x] 1.1 Create the Senclaw monorepo layout for service apps and shared packages.
  - **Done when:** `pnpm-workspace.yaml` exists, declares `apps/*` and `packages/*`, and the corresponding workspace directories exist under `apps/` and `packages/`.

- [x] 1.2 Add workspace-level package manager, TypeScript, lint, and formatting configuration plus documented Rust toolchain conventions for boundary components.
  - **Done when:** root `package.json` has `engines` (node >= 22) and `packageManager` (pnpm 10) fields; `tsconfig.base.json` exists with strict compiler options; `biome.json` is configured; `rust-toolchain.toml` pins the stable channel with clippy, rustfmt, and both Windows MSVC and Linux GNU targets.

- [x] 1.3 Add baseline environment files and platform-specific configuration conventions for Windows and Linux.
  - **Done when:** `.env.example`, `.env.windows.example`, and `.env.linux.example` exist at the repository root; `docs/development/platform-conventions.md` documents shared rules, Windows conventions, and Linux conventions.

- [x] 1.4 Document module ownership rules so TypeScript-default modules and Rust-eligible boundary modules are explicit.
  - **Done when:** a document (in `docs/development/` or `native/README.md`) contains a table or list mapping each `apps/*` and `packages/*` module to TypeScript ownership, and lists the criteria under which a module may be implemented in Rust. `native/README.md` cross-references this document.

## 2. Cross-Platform Developer Workflow

- [x] 2.1 Define the canonical install, dev, lint, test, build, and package commands in the workspace scripts.
  - **Done when:** the root `package.json` `scripts` section contains `install` (implicit), `dev`, `lint`, `format`, `typecheck`, `test`, `build`, `verify`, and `package` entries; each command uses cross-platform tooling and produces equivalent results on Windows and Linux.

- [x] 2.2 Add Windows and Linux command wrappers only where platform behavior differs.
  - **Done when:** any OS-specific wrapper scripts are placed in a `scripts/` directory at the repository root; each wrapper is documented in the bootstrap guide with an explanation of why it differs from the canonical command.

- [x] 2.3 Document bootstrap and local run steps for both supported operating systems.
  - **Done when:** a bootstrap guide exists (in `docs/development/`) with step-by-step instructions for Windows (PowerShell) and Linux (POSIX shell), covering Node.js installation, pnpm installation, Rust toolchain setup, `pnpm install`, and `pnpm run verify`. A new contributor can follow the guide from a clean machine to a passing `verify` run.

- [x] 2.4 Document when contributors should choose TypeScript by default and when Rust is allowed or preferred.
  - **Done when:** the module ownership document from task 1.4 includes a decision flowchart or checklist that a contributor can use to determine whether a new module should be TypeScript or Rust.

## 3. Service and Package Scaffolding

- [x] 3.1 Scaffold the TypeScript-owned gateway, web console, agent runner, connector worker, tool runner host, and scheduler applications.
  - **Done when:** each of the six directories under `apps/` contains `package.json`, `tsconfig.json`, and `src/index.ts`; each `tsconfig.json` extends the workspace base configuration.

- [x] 3.2 Scaffold shared TypeScript packages for protocol types, config loading, logging, and observability.
  - **Done when:** each of the four directories under `packages/` contains `package.json`, `tsconfig.json`, and `src/index.ts`; each `tsconfig.json` extends the workspace base configuration; each package exposes a root entrypoint for future workspace consumption.

- [x] 3.3 Define the packaging and interface contract for future Rust boundary components such as sandbox runners or process supervisors.
  - **Done when:** `native/README.md` documents the expected crate layout, the FFI or CLI interface pattern that TypeScript apps will use to invoke Rust components, and the CI steps required to build and verify Rust crates on both platforms.

- [x] 3.4 Document the dependency boundaries between service apps, shared packages, and Rust-owned boundary modules.
  - **Done when:** a dependency diagram or table exists (in `docs/development/`) showing allowed dependency directions: apps 閿?packages 閿?external; apps 閿?native (via defined interface); packages 閿?apps; native 閿?packages. The document also states that app-to-app dependencies are prohibited.

## 4. Testing Infrastructure

- [x] 4.1 Configure Vitest at the workspace level and add placeholder test files.
  - **Done when:** Vitest is installed as a workspace-level devDependency; a workspace-level Vitest config exists; each package and app under `packages/` and `apps/` contains at least one `*.test.ts` file; `pnpm run test` discovers and runs all test files and exits with code 0.

- [x] 4.2 Define the integration test convention for cross-package contract validation.
  - **Done when:** a document or README section describes where integration tests live (e.g., `tests/integration/` at workspace root or per-app `__tests__/integration/`), how they differ from unit tests, and how to run them separately via a `test:integration` script.

## 5. Verification and Delivery

- [x] 5.1 Add CI jobs for Windows and Linux that run the same lint, test, and build contract for the TypeScript workspace.
  - **Done when:** a CI configuration file (e.g., GitHub Actions workflow) exists with a matrix of `[windows-latest, ubuntu-latest]`; each matrix entry runs `pnpm install --frozen-lockfile`, `pnpm run verify`, and `pnpm run test`; the pipeline status gates merge.

- [x] 5.2 Add CI hooks or placeholder verification steps for Rust boundary components so cross-language validation can be expanded without redesigning the pipeline.
  - **Done when:** the CI configuration includes a conditional Rust verification step that runs `cargo fmt --check` and `cargo clippy --all-targets --all-features` under `native/` if any `.rs` files are present; the step is skipped gracefully when no Rust code exists yet.

- [x] 5.3 Add Linux-first deployment packaging and Windows local validation guidance.
  - **Done when:** a `Dockerfile` or deployment script exists targeting Linux; a `docs/development/local-validation-windows.md` describes how to run and validate services on Windows without production-grade packaging.

- [ ] 5.4 Verify that the documented bootstrap and verification flow works end-to-end on both supported platforms.
  - **Done when:** a contributor who is not the author follows the bootstrap guide from task 2.3 on both a clean Windows machine and a clean Linux machine, and reports that `pnpm install` and `pnpm run verify` succeed without undocumented manual steps.

