# Error Handling Policy

This note defines the first-party error-handling taxonomy used by SenClaw maintainability refactors.

## Strategies

- `fail-fast`
  Use when the caller cannot make progress without the failed operation. Re-throw or return a typed error immediately.
- `degrade-and-continue`
  Use when the failed path is optional and the primary workflow should remain available. Log the error and continue with reduced capability.
- `retry-or-poll`
  Use when a transient failure is expected during background polling or long-running follow loops. Retry on the next interval and avoid surfacing noise every tick.
- `intentional-swallow`
  Use only for best-effort parsing or local environment probes. Document why the fallback value is safe.

## Operator Surface Rules

- CLI and Web map `401` to `Authentication failed` and `403` to `Not enough permissions` at the first-party boundary.
- Missing browser API key configuration remains a typed `MissingApiKeyError` in Web so protected views can render a specific recovery message.
- Network connectivity failures surface as direct actionable messages, not raw transport exceptions.

## Current Hotspot Inventory

| Location | Strategy | Rationale |
| --- | --- | --- |
| `apps/gateway/src/assembly/connectors.ts` dynamic import catch | degrade-and-continue | Gateway can still serve core APIs without connector workers. |
| `apps/gateway/src/plugins/auth.ts` audit-log and usage-update catches | degrade-and-continue | Auth success should not be blocked by auxiliary persistence writes. |
| `packages/cli/src/commands/run.ts` follow-loop poll catch | retry-or-poll | Transient fetch failures during tailing should self-heal on the next poll. |
| `apps/web/src/api-client.ts` JSON payload parsing catch | intentional-swallow | Non-JSON error bodies should fall back to status text/details parsing. |
| `packages/cli/src/lib/config.ts` config-file load catch | intentional-swallow | Corrupt or missing local config falls back to safe defaults. |
| `apps/gateway/src/routes/tasks.ts` and `jobs.ts` not-found translation catches | fail-fast | Domain failures are translated once into stable HTTP responses. |

## Review Checklist

When adding or changing a `catch` block:

1. Pick one strategy from this note.
2. Make the strategy obvious in code with either a typed translation, a log message, or an inline comment.
3. Avoid silent swallowing unless the fallback value is demonstrably safe.
4. Keep operator-facing auth and permission errors aligned with the CLI/Web rules above.
