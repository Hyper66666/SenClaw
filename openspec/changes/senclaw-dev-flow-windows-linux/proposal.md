## Why

Senclaw is still at the planning stage, so the highest leverage change right now is to define a clear development workflow before implementation starts. Limiting the first iteration to Windows and Linux reduces platform ambiguity, keeps toolchain decisions concrete, and prevents the early design from inheriting unnecessary macOS or mobile requirements.

Without this workflow locked down first, implementation work risks divergent toolchains across contributors, untested platform assumptions, and ad hoc decisions about language choice, testing, versioning, and dependency management that compound as the codebase grows.

## What Changes

- Define an official Senclaw development workflow for the pre-implementation phase.
- Establish Windows and Linux as the only supported development and runtime platforms for v1 planning.
- Define the primary implementation language strategy: TypeScript for the v1 control plane and business orchestration, with Rust reserved for selected performance, sandbox, and process-supervision components.
- Describe the expected lifecycle from environment setup, local development, testing, packaging, and operational rollout.
- Document the system boundaries for the first build: gateway, web console, agent runtime, connector workers, tool runner, and scheduler.
- Specify the verification gates and operational quality checks required before feature implementation begins.
- Define a repository-managed runtime and toolchain version policy: Node.js 22 as the minimum supported runtime, an exact pnpm package-manager version, workspace TypeScript/Biome baselines, and the Rust stable channel to prevent environment drift.
- Define a layered testing strategy (unit, integration, cross-platform smoke) and select Vitest as the test framework.
- Establish dependency management discipline and workspace-level lockstep versioning for the monorepo.
- Require OpenSpec artifacts as the authoritative control point for architectural decisions and feature planning.

## Capabilities

### New Capabilities
- `development-workflow`: Defines the required development process, supported platforms, environment setup, build and verification flow, language strategy, testing strategy, dependency management, versioning policy, and delivery gates for Senclaw on Windows and Linux.

### Modified Capabilities
- None.

## Impact

- Creates the baseline OpenSpec artifacts for future Senclaw implementation work.
- Constrains future architecture and tooling choices to Windows and Linux support.
- Establishes a mixed-language direction so future implementation work does not reopen the TypeScript versus Rust decision on every module.
- Drives upcoming repository layout, CI jobs, packaging strategy, and local developer onboarding.
- Locks testing infrastructure and dependency management conventions before feature code introduces technical debt.
- Ensures all future feature work goes through the OpenSpec change process, maintaining traceability from requirements to implementation.

