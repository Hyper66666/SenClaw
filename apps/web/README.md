# Web Console

The Senclaw web console is a React application for operators who prefer a browser workflow over direct API calls.

## Current Capabilities

- list, inspect, create, and delete agents
- inspect background agent tasks and their transcript history
- resume background agent tasks and send follow-up messages
- submit foreground tasks and inspect runs/messages
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

The dev server proxies `/api` to the gateway and keeps `/health` as a front-end route that calls `/api/runtime/health` behind the typed client.

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
- background agent task list polls every 5 seconds
- active background agent task details poll every 2 seconds while the task is active
- health polls every 30 seconds

## Background Agent Task Surfaces

The web console now includes:

- `/agent-tasks` for listing background agent tasks
- `/agent-tasks/:id` for transcript inspection, follow-up messages, and manual resume

The current implementation focuses on inspection and continuation. Background task creation is available through the API and CLI today.

## Protected Gateway Acceptance Checklist

Use this checklist before claiming the web console is ready for operator use against a protected gateway:

1. configure a valid bearer token through the header session form
2. load the agents list successfully
3. create an agent successfully
4. submit a task and open the resulting run detail view
5. open the background task list and inspect a task transcript successfully
6. send a follow-up message or resume a background task successfully
7. delete the test agent and confirm the `204` flow completes without a client-side parse error
8. clear or replace the token and confirm missing, invalid, and revoked credentials show a recoverable error state

## Current Limits

- there is no end-user identity system; operators bring their own API key
- background task creation is not yet exposed as a dedicated web form
- release readiness still depends on the remaining `agent-runtime-evolution` behavior coverage and documentation closure
