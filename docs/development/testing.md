# Testing Strategy

Senclaw uses a layered testing model from the start.

## Unit Tests

Unit tests live close to each workspace module:

- `apps/*/tests/**/*.test.ts`
- `packages/*/tests/**/*.test.ts`

Run them with:

- `pnpm run test`

These tests cover module-local behavior such as descriptor factories, config normalization, and shared helper functions.

## Integration Tests

Integration tests live at the workspace root:

- `tests/integration/**/*.test.ts`

Run them with:

- `pnpm run test:integration`

Integration tests validate cross-package and cross-app contracts, for example making sure shared platform declarations stay aligned between app descriptors and the protocol package.

## Verification Contract

`pnpm run verify` is intentionally separate from tests. It runs:

- `pnpm run lint`
- `pnpm run format:check`
- `pnpm run typecheck`

CI runs `verify`, `test`, and `test:integration` on both supported platforms.