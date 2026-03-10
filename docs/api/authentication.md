# API Authentication

Senclaw's gateway now requires authentication on every API endpoint except `GET /health`.

## API Key Format

- Format: `sk_[A-Za-z0-9]{43}`
- Transport: `Authorization: Bearer <api-key>`
- Fallback transport: `?api_key=<api-key>` for webhook-style callers
- Storage: plaintext keys are shown only once on creation; the database stores a bcrypt hash plus a deterministic lookup hash for indexed lookup

## Quick Start

### 1. Bootstrap an admin key

With SQLite persistence enabled:

```bash
SENCLAW_DB_URL=file:./senclaw.db pnpm run auth:bootstrap-admin
```

The command prints a one-time bootstrap admin key. If a key already exists, the command exits without generating another one.

### 2. Call the API with the key

```bash
curl http://localhost:4100/api/v1/agents \
  -H "Authorization: Bearer sk_your_key_here"
```

### 3. Create scoped keys for apps or users

```bash
curl -X POST http://localhost:4100/api/v1/keys \
  -H "Authorization: Bearer sk_admin_key" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Web Console",
    "role": "user",
    "expiresAt": "2027-01-01T00:00:00.000Z"
  }'
```

Response:

```json
{
  "id": "a9f2...",
  "key": "sk_...",
  "name": "Web Console",
  "role": "user",
  "createdAt": "2026-03-10T12:00:00.000Z",
  "expiresAt": "2027-01-01T00:00:00.000Z"
}
```

The `key` field is only returned once.

## Role Permissions Matrix

| Endpoint | admin | user | readonly |
| --- | --- | --- | --- |
| `GET /health` | yes | yes | yes |
| `GET /api/v1/agents` | yes | yes | yes |
| `POST /api/v1/agents` | yes | yes | no |
| `DELETE /api/v1/agents/:id` | yes | yes | no |
| `POST /api/v1/tasks` | yes | yes | no |
| `GET /api/v1/runs/:id` | yes | yes | yes |
| `GET /api/v1/runs/:id/messages` | yes | yes | yes |
| `POST /api/v1/keys` | yes | no | no |
| `GET /api/v1/keys` | yes | no | no |
| `DELETE /api/v1/keys/:id` | yes | no | no |
| `GET /api/v1/keys/:id/audit` | yes | no | no |

## Authentication Examples

### Read with a readonly key

```bash
curl http://localhost:4100/api/v1/agents \
  -H "Authorization: Bearer sk_readonly_key"
```

### Submit work with a user key

```bash
curl -X POST http://localhost:4100/api/v1/tasks \
  -H "Authorization: Bearer sk_user_key" \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "agent-123",
    "input": "Summarize the incident"
  }'
```

### Inspect audit logs with an admin key

```bash
curl http://localhost:4100/api/v1/keys/<key-id>/audit \
  -H "Authorization: Bearer sk_admin_key"
```

## Rate Limits

Default per-minute limits:

- `admin`: `1000`
- `user`: `100`
- `readonly`: `50`

Override them with:

```bash
SENCLAW_RATE_LIMIT_ADMIN=1000
SENCLAW_RATE_LIMIT_USER=100
SENCLAW_RATE_LIMIT_READONLY=50
SENCLAW_AUDIT_LOG_RETENTION_DAYS=90
```

When a caller exceeds its limit, the gateway returns `429 Too Many Requests` with rate-limit headers and `Retry-After`.

## Breaking Change Migration Guide

Authentication is now mandatory for all gateway endpoints except `/health`.

### Existing clients

1. Generate or bootstrap an admin key.
2. Create least-privilege keys for each caller.
3. Update every client to send `Authorization: Bearer <api-key>`.
4. Validate read/write permissions against the role matrix above.
5. Watch `GET /api/v1/keys/:id/audit` for usage verification during rollout.

### Web console integration

The web package now exports `createApiClient` from [apps/web/src/api-client.ts](D:/senclaw/apps/web/src/api-client.ts). It attaches the bearer token automatically:

```ts
import { createApiClient } from "@senclaw/web";

const client = createApiClient({
  baseUrl: "http://localhost:4100",
  apiKey: window.localStorage.getItem("senclaw_api_key") ?? "",
});

const agents = await client.request("/api/v1/agents");
```

Store the key in a secure client-side location and rotate it regularly.
