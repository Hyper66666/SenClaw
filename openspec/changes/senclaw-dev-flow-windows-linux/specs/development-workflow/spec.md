## ADDED Requirements

### Requirement: Official platform scope
The Senclaw development workflow SHALL define Windows and Linux as the only supported platforms for the first implementation phase and MUST explicitly mark other platforms as out of scope.

#### Scenario: Supported platform matrix is documented
- **WHEN** a developer inspects the repository documentation
- **THEN** `docs/development/platform-conventions.md` exists and lists Windows and Linux as the only supported platforms
- **AND** the document explicitly states that macOS, iOS, Android, and other platforms are out of scope for v1

#### Scenario: CI pipeline enforces platform matrix
- **WHEN** a CI pipeline configuration is added to the repository
- **THEN** it defines a build matrix containing exactly Windows and Linux runners
- **AND** no other platform runners are included

#### Scenario: Unsupported platform request is evaluated
- **WHEN** a contributor proposes macOS or mobile-specific workflow steps
- **THEN** the proposal is rejected or deferred as out of scope unless accompanied by an approved OpenSpec change that expands the platform matrix

### Requirement: Primary language strategy
The Senclaw development workflow SHALL define TypeScript as the primary implementation language for the gateway, web console, agent runner, connector workers, scheduler, and shared orchestration packages.

#### Scenario: All v1 service apps are TypeScript-owned
- **WHEN** a developer lists the apps in `apps/`
- **THEN** every app directory contains a `package.json` with TypeScript as the implementation language
- **AND** every app directory contains a `tsconfig.json` that extends the workspace base configuration

#### Scenario: New application-facing module defaults to TypeScript
- **WHEN** a contributor proposes a new module for web integration, protocol orchestration, or connector logic
- **THEN** the module MUST be implemented in TypeScript unless the contributor provides written justification documenting why Rust is required per the boundary component policy

### Requirement: Rust boundary component policy
The Senclaw development workflow SHALL reserve Rust for modules where system safety, process supervision, sandboxing, native execution boundaries, or performance isolation justify the extra implementation cost.

#### Scenario: Rust component location is enforced
- **WHEN** a contributor adds a Rust crate to the repository
- **THEN** the crate resides under `native/`
- **AND** `native/README.md` documents the crate's purpose and how the TypeScript workspace builds or invokes it

#### Scenario: Rust is proposed for a general orchestration module
- **WHEN** a contributor proposes Rust for a gateway, scheduler, connector, or similar orchestration module
- **THEN** the proposal MUST include an OpenSpec design decision documenting why TypeScript is insufficient for that specific module's requirements

#### Scenario: Rust toolchain conventions are documented
- **WHEN** a developer reads `native/README.md`
- **THEN** it specifies the required Rust toolchain channel, formatting command (`cargo fmt`), linting command (`cargo clippy --all-targets --all-features`), and crate location rules

### Requirement: Monorepo structure
The Senclaw development workflow SHALL use a single pnpm workspace monorepo containing service applications under `apps/` and shared libraries under `packages/`.

#### Scenario: Workspace layout is valid
- **WHEN** a developer runs `pnpm install` at the repository root
- **THEN** pnpm discovers all packages listed in `pnpm-workspace.yaml` under `apps/*` and `packages/*`
- **AND** no workspace package fails to resolve its intra-workspace dependencies

#### Scenario: Shared code goes to packages, not apps
- **WHEN** a concern such as protocol types, config loading, logging, or observability is needed by more than one app
- **THEN** it is implemented as a package under `packages/` with its own `package.json` and `tsconfig.json`
- **AND** consuming apps declare it as a workspace dependency

### Requirement: Cross-platform environment bootstrap
The Senclaw development workflow SHALL provide bootstrap steps for Windows and Linux that produce equivalent developer outcomes, including tool installation, dependency installation, local configuration, and a runnable workspace.

#### Scenario: Windows bootstrap
- **WHEN** a developer starts from a clean Windows machine with PowerShell available
- **THEN** following the documented bootstrap steps installs Node.js >= 22, pnpm 10, and the Rust stable toolchain
- **AND** `pnpm install` succeeds without errors
- **AND** `pnpm run verify` passes all lint, format-check, and typecheck gates

#### Scenario: Linux bootstrap
- **WHEN** a developer starts from a clean Linux machine with a POSIX shell
- **THEN** following the documented bootstrap steps installs Node.js >= 22, pnpm 10, and the Rust stable toolchain
- **AND** `pnpm install` succeeds without errors
- **AND** `pnpm run verify` passes all lint, format-check, and typecheck gates

#### Scenario: Environment configuration files exist
- **WHEN** a developer inspects the repository root
- **THEN** `.env.example` exists with cross-platform baseline configuration
- **AND** `.env.windows.example` exists with Windows-specific overrides
- **AND** `.env.linux.example` exists if Linux-specific overrides are needed

### Requirement: Standard developer command contract
The Senclaw development workflow SHALL define one canonical command set for install, dev, lint, test, build, and package operations, and those commands MUST have equivalent outcomes on Windows and Linux.

#### Scenario: Canonical commands are defined in the workspace root
- **WHEN** a developer inspects the `scripts` section of the root `package.json`
- **THEN** it contains entries for at least: `lint`, `format`, `typecheck`, `verify`, `test`, `build`, and `dev`
- **AND** each script uses cross-platform tooling (pnpm, Biome, Vitest, tsc) rather than OS-specific shell commands

#### Scenario: Verification produces identical outcomes
- **WHEN** a developer runs `pnpm run verify` on Windows
- **AND** a developer runs `pnpm run verify` on Linux
- **THEN** both executions run the same lint, format-check, and typecheck contract
- **AND** both produce a pass or fail result for the same set of checks

### Requirement: Initial service boundary definition
The Senclaw development workflow SHALL define the initial implementation units for gateway, web console, agent runner, connector worker, tool runner, scheduler, and shared packages.

#### Scenario: All six service apps exist
- **WHEN** a developer lists directories under `apps/`
- **THEN** exactly these directories exist: `gateway`, `web`, `agent-runner`, `connector-worker`, `tool-runner-host`, `scheduler`
- **AND** each contains a `package.json`, `tsconfig.json`, and `src/index.ts`

#### Scenario: All four shared packages exist
- **WHEN** a developer lists directories under `packages/`
- **THEN** exactly these directories exist: `protocol`, `config`, `logging`, `observability`
- **AND** each contains a `package.json`, `tsconfig.json`, and `src/index.ts`

#### Scenario: Dependency direction is enforced
- **WHEN** a service app under `apps/` declares a workspace dependency
- **THEN** it depends only on packages under `packages/` or external npm packages
- **AND** no service app depends directly on another service app

### Requirement: Cross-platform verification gate
The Senclaw development workflow SHALL require verification on both Windows and Linux before a change is considered ready for implementation or merge.

#### Scenario: CI runs on both platforms
- **WHEN** a CI pipeline is configured for the repository
- **THEN** it runs lint, typecheck, and test jobs on both a Windows runner and a Linux runner
- **AND** a change is not merge-eligible unless both platform jobs succeed

#### Scenario: Verification fails on one platform
- **WHEN** the verification contract passes on Linux but fails on Windows, or vice versa
- **THEN** the change is marked as failing and MUST NOT be merged until the failing platform is fixed

### Requirement: Deployment target policy
The Senclaw development workflow SHALL define Linux as the primary deployment target for long-running services and SHALL define Windows support as development and local validation scope unless later work expands packaging support.

#### Scenario: Production deployment targets Linux
- **WHEN** the team prepares deployment packaging (containers, systemd units, or equivalent)
- **THEN** the packaging targets Linux as the runtime environment
- **AND** no Windows-specific service packaging is required for v1

#### Scenario: Windows local validation is supported
- **WHEN** a developer runs services locally on Windows for testing
- **THEN** `pnpm run dev` starts the service stack without requiring Linux-specific tools
- **AND** the workflow documents any Windows-specific limitations or differences

### Requirement: Runtime and toolchain version policy
The Senclaw development workflow SHALL define repository-managed runtime and toolchain baselines in the repository to prevent environment drift.

#### Scenario: Node.js version is constrained
- **WHEN** a developer inspects the root `package.json`
- **THEN** the `engines` field specifies `node >= 22`
- **AND** CI runners use a Node.js version that satisfies this constraint

#### Scenario: Package manager is pinned
- **WHEN** a developer inspects the root `package.json`
- **THEN** the `packageManager` field specifies an exact pnpm version in the 10.x series

#### Scenario: TypeScript version is consistent
- **WHEN** a developer inspects the workspace TypeScript dependency
- **THEN** a TypeScript 5.7 baseline is declared as a workspace-level devDependency
- **AND** all `tsconfig.json` files extend `tsconfig.base.json` at the workspace root

#### Scenario: Rust toolchain is pinned
- **WHEN** a developer inspects `rust-toolchain.toml`
- **THEN** it specifies the `stable` channel with required components (`clippy`, `rustfmt`) and targets for both `x86_64-pc-windows-msvc` and `x86_64-unknown-linux-gnu`

### Requirement: Testing strategy
The Senclaw development workflow SHALL define a layered testing strategy covering unit tests, integration tests, and cross-platform smoke tests.

#### Scenario: Test framework is configured at workspace level
- **WHEN** a developer inspects the workspace root
- **THEN** Vitest is installed as a workspace-level devDependency
- **AND** a workspace-level Vitest configuration file exists or each package defines its own Vitest config extending a shared base

#### Scenario: Each package and app has a test entry point
- **WHEN** a developer runs `pnpm run test` at the workspace root
- **THEN** Vitest discovers and executes test files across all packages and apps
- **AND** the exit code is non-zero if any test fails

#### Scenario: Cross-platform smoke test runs in CI
- **WHEN** the CI pipeline executes on a new change
- **THEN** `pnpm run verify` and `pnpm run test` both execute on Windows and Linux runners
- **AND** failure on either platform blocks merge

### Requirement: Dependency management discipline
The Senclaw development workflow SHALL enforce consistent dependency management across the monorepo.

#### Scenario: Lockfile is committed and enforced
- **WHEN** a developer inspects the repository root
- **THEN** `pnpm-lock.yaml` is committed to version control
- **AND** CI runs `pnpm install --frozen-lockfile` to prevent lockfile drift

#### Scenario: Shared dependencies are hoisted
- **WHEN** a dependency (e.g., TypeScript, Vitest, Biome) is used by multiple packages
- **THEN** it is declared in the root `package.json` devDependencies
- **AND** individual packages do not duplicate the same dependency at different versions unless explicitly justified

#### Scenario: Workspace packages declare explicit dependencies
- **WHEN** a package under `packages/` or `apps/` imports from another workspace package
- **THEN** the importing package lists the dependency in its own `package.json` using `workspace:*` protocol

### Requirement: Workspace-level lockstep versioning
The Senclaw development workflow SHALL use a single shared version for all packages and apps during v1 development.

#### Scenario: Version is defined at workspace root
- **WHEN** a developer inspects the root `package.json`
- **THEN** a `version` field defines the current workspace-wide version
- **AND** individual package versions either match or are omitted (using `0.0.0` or `private: true`)

#### Scenario: Version bump is coordinated
- **WHEN** the workspace version needs to change
- **THEN** it is updated in the root `package.json`
- **AND** the change is documented in the corresponding OpenSpec change or release notes

### Requirement: OpenSpec as the planning control point
The Senclaw development workflow SHALL require that architectural decisions, new service behaviors, and platform scope changes go through the OpenSpec change process before implementation.

#### Scenario: Feature work requires an OpenSpec change
- **WHEN** a contributor begins implementation of a new service feature or cross-service behavior change
- **THEN** an approved OpenSpec change (with proposal, design, and spec) exists for that work before code is merged

#### Scenario: Design decisions are traceable
- **WHEN** a reviewer asks why a particular architectural choice was made
- **THEN** the relevant OpenSpec design document in `openspec/changes/` contains the decision, alternatives considered, and rationale


