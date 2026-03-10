# Platform Configuration Conventions

Senclaw v1 supports Windows and Linux only.

## Shared Rules

- Keep `.env.example` as the cross-platform baseline.
- Add OS-specific overrides in `.env.windows.example` or `.env.linux.example`.
- Treat relative paths as workspace-local unless explicitly documented otherwise.

## Windows

- Prefer PowerShell-compatible commands for local development.
- Use `%USERPROFILE%\\.senclaw\\data` for developer-local data unless overridden.
- Treat Windows as a first-class development platform and local validation target.

## Linux

- Prefer POSIX-compatible commands for local development and deployment automation.
- Use `/var/lib/senclaw` as the default service data root for deployment-oriented examples.
- Treat Linux as the primary deployment target for long-running services.
