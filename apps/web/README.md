# Web Console

The Senclaw web console is a React application for operators who prefer a browser workflow over direct API calls.

## Current Capabilities

- list, inspect, create, and delete agents
- submit tasks and inspect runs/messages
- view gateway health
- store a lightweight gateway API key in the browser and reuse it for protected `/api/v1/*` requests
- surface actionable UI messages for missing API keys, `401`, and `403` responses
- handle `204 No Content` delete responses without client-side parse errors

## Authentication Model

Protected gateway routes require a bearer API key. The web console does not implement a separate login flow.

Instead, the header includes a small API-key session form:

1. paste a gateway API key into the header input
2. click `Save key`
3. retry the protected view or action

The key is stored in `localStorage` for the current browser profile and attached to protected requests as:

```http
Authorization: Bearer <token>
```

If no key is configured, the UI stops protected requests before they are sent and shows a recoverable prompt.

## Development

Start the standalone Vite server:

```bash
corepack pnpm --filter @senclaw/web dev
```

Default dev URL:

- `http://localhost:3000`

The dev server proxies `/api` and `/health` to the gateway at `http://localhost:4100`.

## Production Build

```bash
corepack pnpm --filter @senclaw/web build
corepack pnpm --filter @senclaw/web preview
```

Default preview URL:

- `http://localhost:4173`

## Architecture Notes

- React 18 + TypeScript
- Vite
- React Router v6
- TanStack Query for server-state fetches and refetching
- Tailwind-based UI components
- typed fetch client shared through `src/index.ts` and `src/lib/api.ts`

## Real-Time Behavior

- runs list polls every 5 seconds
- active run details poll every 2 seconds while the run is active
- health polls every 30 seconds

## Current Limits

- there is no end-user identity system; operators bring their own API key
- the console currently targets the gateway API only
- release readiness still depends on repository-wide `pnpm run verify` cleanup and recorded manual verification against a protected gateway
