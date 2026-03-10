## Context

Senclaw currently has no implementation code and only a freshly initialized OpenSpec workspace. This change defines the development workflow that future implementation work will follow, with scope intentionally limited to Windows and Linux so the first delivery can make concrete toolchain, packaging, and verification decisions.

A major early decision is whether Senclaw should be primarily implemented in TypeScript or Rust. Because the v1 challenge is orchestration, web control, connector integration, and iteration speed rather than CPU-bound throughput, this design needs to lock a default language strategy before repository scaffolding begins.

The planned v1 system includes a gateway, web console, agent runtime, connector workers, tool runner, scheduler, and shared packages. The workflow must support those service boundaries without requiring a large-platform matrix or early mobile and macOS commitments.

## Goals / Non-Goals

**Goals:**
- Define an official Senclaw development workflow for Windows and Linux.
- Standardize repository layout, service boundaries, and shared tooling before implementation starts.
- Record a primary language strategy that optimizes v1 delivery speed without giving up the option to use Rust where it is clearly justified.
- Ensure developers can bootstrap, run, verify, and package the project with equivalent commands on both supported operating systems.
- Prevent platform drift by making Windows and Linux part of the same verification contract.
- Keep the workflow implementation-ready for future gateway, web, agent, connector, scheduler, and tool-runner work.
- Define repository-managed runtime and toolchain baselines to prevent environment drift across contributors and CI.
- Establish a testing strategy that covers unit, integration, and service-boundary validation before feature work starts.
- Define dependency management and versioning policies appropriate for a multi-package monorepo.

**Non-Goals:**
- Implement Senclaw runtime features in this change.
- Support macOS, iOS, Android, or any other platform.
- Rewrite the full v1 system in Rust.
- Finalize every product-level capability such as channel list, memory backend, or mobile nodes.
- Commit to enterprise multi-tenant deployment concerns in v1.
- Define end-to-end test scenarios for specific product features (deferred to feature-level changes).

## Decisions

### 1. Use TypeScript as the primary v1 language for the control plane and product surface
Senclaw will use TypeScript for the gateway, web console, agent runner, connector workers, scheduler, and shared orchestration packages. These modules are dominated by protocol handling, web integration, async I/O, SDK integration, and rapid iteration, all of which favor the TypeScript and Node.js ecosystem.

Alternative considered: write the full v1 system in Rust. This was rejected because it would slow initial delivery, raise iteration cost while the product shape is still moving, and give weaker leverage for web UI, bot integrations, and LLM-oriented application wiring.

### 2. Reserve Rust for boundary components where system-level guarantees matter more than iteration speed
Rust remains part of the architecture, but only for components such as sandbox runners, process supervisors, tool executors, or other performance- and safety-sensitive modules. These are the places where tighter memory control, stronger process isolation, and more predictable long-running behavior justify the extra engineering cost.

Alternative considered: implement every component in TypeScript. This was rejected because Node is a weaker fit for hard process isolation, native supervision, and low-level execution boundaries.

### 3. Use a TypeScript monorepo with shared packages and service apps
Senclaw will start with a single repository that contains service applications and shared packages. This keeps protocol definitions, shared types, config handling, and build tooling centralized while the system is still evolving.

Alternative considered: separate repositories per service. This was rejected because it increases coordination cost, version skew, and setup friction before the core boundaries are stable.

### 4. Design the workflow around explicit service boundaries from day one
The workflow will assume six core units: gateway, web console, agent runner, connector worker, tool runner, and scheduler. They may share local process orchestration early, but the design treats them as separate operational responsibilities.

Alternative considered: a single monolith with later extraction. This was rejected because orchestration platforms tend to accumulate tightly coupled scheduling, connector lifecycle, and agent state management within monolith processes, making later decomposition significantly more expensive than starting with explicit boundaries.

### 5. Standardize on cross-platform developer commands with OS-specific wrappers only at the edge
Core tasks such as install, dev, lint, test, build, and package should have one canonical command set. PowerShell or shell wrapper differences are allowed only where operating-system behavior differs.

Alternative considered: separate command flows per platform. This was rejected because it creates hidden divergence and makes Windows support decay quickly.

### 6. Make Linux the primary production deployment target and Windows a first-class development platform
The workflow will support development on both Windows and Linux, but Linux remains the default deployment target for long-running services. Windows is still supported for local execution, validation, and small-scale single-node testing.

Alternative considered: equal production-grade support on both platforms from v1. This was rejected because service supervision, packaging, and container behavior differ enough to expand scope without adding proportional product value at this stage.

### 7. Require cross-platform verification before implementation changes are considered ready
Every future implementation change should be verifiable on both supported operating systems through automated checks. The workflow therefore needs a CI matrix and local verification guidance that explicitly covers Windows and Linux.

Alternative considered: Linux-only CI with best-effort Windows support. This was rejected because unsupported drift usually appears first in path handling, process management, and shell assumptions.

### 8. Use OpenSpec artifacts as the control point for planning and execution
Proposal, design, spec, and task artifacts are the authoritative planning surface for Senclaw changes. This keeps technical decisions, requirements, and implementation sequencing connected. Every implementation change that introduces new service behavior, modifies cross-service contracts, or changes platform support MUST be preceded by an approved OpenSpec change.

Alternative considered: ad hoc notes and implementation-first development. This was rejected because the project is still at the system-definition stage and needs tighter change contracts.

### 9. Define repository-managed runtime and toolchain baselines
Senclaw will manage runtime and toolchain versions from the repository root, but not every tool is pinned the same way. Node.js is defined as a minimum supported runtime via `engines` (`>= 22`), pnpm is pinned exactly via `packageManager`, TypeScript and Biome are declared as workspace-level devDependency baselines, and Rust is constrained through `rust-toolchain.toml` to the `stable` channel. This keeps contributor and CI environments aligned while still allowing appropriate flexibility where exact pinning is unnecessary.

Alternative considered: allow contributors to use any compatible Node.js or pnpm version. This was rejected because version drift across environments is a common source of hard-to-reproduce build and test failures, especially in a monorepo with multiple packages.

### 10. Establish a layered testing strategy before feature implementation
Testing is organized in three layers: (1) unit tests per package and app using Vitest, covering module-internal logic in isolation; (2) integration tests at service boundaries, validating cross-package contracts and protocol correctness; (3) cross-platform smoke tests in CI confirming that the build, lint, and test pipeline succeeds on both Windows and Linux. Feature-level end-to-end tests are deferred to individual feature changes but must follow the same framework.

Alternative considered: defer all testing decisions until the first feature is implemented. This was rejected because retrofitting test infrastructure onto existing code is more expensive and leads to inconsistent coverage across services.

Alternative considered: use Jest instead of Vitest. This was rejected because Vitest has native ESM support, faster execution through Vite's transform pipeline, and better alignment with the ES module-first strategy adopted in Decision 1.

### 11. Enforce dependency management discipline in the monorepo
All external dependencies are locked via `pnpm-lock.yaml` and committed to the repository. Shared dependencies used by multiple packages SHOULD be hoisted to the workspace root. Each package declares its own `dependencies` and `devDependencies` explicitly; implicit hoisting reliance is prohibited. Dependency updates are batched and verified through the full CI pipeline before merge.

Alternative considered: allow each package to independently manage dependency versions. This was rejected because version fragmentation in a monorepo leads to duplicate installations, inconsistent behavior, and hard-to-diagnose conflicts.

### 12. Use workspace-level lockstep versioning during v1
During v1 development, all packages and apps share a single version number managed at the workspace root. Independent per-package versioning is deferred until service boundaries stabilize and external consumers exist. Version bumps are coordinated through the OpenSpec change process.

Alternative considered: independent semantic versioning per package from day one. This was rejected because the overhead of managing cross-package version compatibility is not justified while the API surface is still evolving rapidly and there are no external consumers.

## Risks / Trade-offs

- [A mixed TypeScript and Rust codebase adds build and contributor complexity] -> Mitigation: keep TypeScript as the default path, isolate Rust to clearly owned boundary components under `native/`, and document cross-language ownership rules early.
- [Windows path, shell, and process behavior differ from Linux] -> Mitigation: keep canonical commands platform-neutral via pnpm scripts, isolate OS-specific wrappers, and run both platforms in CI on every change.
- [Early service boundaries may feel heavier than a simple prototype] -> Mitigation: allow local composition in a single dev stack while preserving clean package and runtime boundaries.
- [Linux-first deployment may leave Windows operations less mature] -> Mitigation: document Windows as development and local-validation scope, not as the primary production target.
- [TypeScript may be insufficient for a future low-level subsystem] -> Mitigation: make Rust an approved escape hatch for sandboxing, supervision, and performance-sensitive modules from the beginning.
- [Tooling choices made now may need adjustment once code exists] -> Mitigation: keep the workflow opinionated at the process level while leaving backend details such as storage implementation open.
- [Repository-managed toolchain baselines may fall behind upstream releases] -> Mitigation: schedule periodic dependency update reviews (at least monthly) and document the upgrade path in the workflow.
- [Lockstep versioning may slow down independent service iteration later] -> Mitigation: this is a v1 constraint; transition to independent versioning is planned once service boundaries stabilize and external package consumers appear.

## Migration Plan

1. Create the repository skeleton and package boundaries that match the workflow.
2. Record module ownership by language so TypeScript-first modules and Rust-boundary modules are explicit.
3. Add shared scripts or task runners for install, dev, lint, test, build, and package.
4. Configure Vitest at the workspace level and add placeholder test files to each package and app.
5. Add Windows and Linux CI jobs that run the same verification contract.
6. Add deployment packaging for Linux and local run documentation for Windows.
7. Apply future feature changes only through this workflow.

Rollback is straightforward because this is a planning change: archive or revert the OpenSpec change if the workflow direction is replaced before implementation begins.

## Open Questions

Each question is tagged with the phase by which it should be resolved.

- **[Resolve before first feature implementation]** Should the first implementation use PostgreSQL and Redis immediately, or start with a simpler local storage path during early prototyping? The storage choice affects the bootstrap complexity for new contributors and the shape of the integration test environment.
- **[Resolve before task 2.2]** Should Windows local development prefer pure native processes, Docker Desktop, or support both equally in the first workflow cut? This affects the content of platform-specific wrappers and the bootstrap documentation.
- **[Resolve before first Rust module implementation]** Which boundary components, if any, need Rust in the first implementation slice rather than later? If none are needed immediately, the Rust toolchain requirement can remain documentation-only until a concrete module is approved.
- **[Resolve before connector-worker feature work]** Do we want a single connector worker binary with pluggable adapters, or one worker process per connector family? This shapes the `connector-worker` app structure and its deployment packaging.

