# API Authentication — Design Document

## Overview

API Authentication adds security to the Senclaw REST API using API key-based authentication, role-based access control (RBAC), rate limiting, and audit logging. All API endpoints (except `/health`) require a valid API key.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Client (Web Console, CLI, SDK)            │
│  Authorization: Bearer sk_abc123...                          │
└──────────────────────────┬───────────────────────────────────┘
                           │ HTTPS
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    Gateway (Fastify)                         │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Authentication Middleware (preHandler)               │  │
│  │  1. Extract API key from header/query                 │  │
│  │  2. Validate key format (sk_[43 chars])               │  │
│  │  3. Lookup key in database                            │  │
│  │  4. Check expiration, revocation                      │  │
│  │  5. Attach key metadata to request context            │  │
│  │  6. Update last_used_at (async)                       │  │
│  └───────────────────────────────────────────────────────┘  │
│                           ↓                                  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Authorization Middleware (preHandler)                │  │
│  │  1. Check required role for route                     │  │
│  │  2. Compare with key's role                           │  │
│  │  3. Return 403 if insufficient permissions            │  │
│  └───────────────────────────────────────────────────────┘  │
│                           ↓                                  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Rate Limiting Middleware (@fastify/rate-limit)       │  │
│  │  1. Use key ID as identifier                          │  │
│  │  2. Check request count in time window                │  │
│  │  3. Return 429 if limit exceeded                      │  │
│  └───────────────────────────────────────────────────────┘  │
│                           ↓                                  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Route Handler                                        │  │
│  │  Process request, return response                     │  │
│  └───────────────────────────────────────────────────────┘  │
│                           ↓                                  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Audit Logging (onResponse hook)                     │  │
│  │  Log: key_id, method, path, status, ip, timestamp    │  │
│  └───────────────────────────────────────────────────────┘  │
│                           ↓                                  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  API Key Repository (SQLite)                          │  │
│  │  - api_keys table                                     │  │
│  │  - audit_logs table                                   │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Database Schema

### API Keys Table

```sql
CREATE TABLE api_keys (
  id TEXT PRIMARY KEY,
  key_hash TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL, -- 'admin', 'user', 'readonly'
  created_by TEXT, -- user ID or 'system' for bootstrap key
  created_at TEXT NOT NULL,
  expires_at TEXT, -- NULL = never expires
  last_used_at TEXT,
  revoked_at TEXT, -- NULL = active, timestamp = revoked
  revoked_by TEXT,
  revoked_reason TEXT
);

CREATE INDEX idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX idx_api_keys_role ON api_keys(role);
CREATE INDEX idx_api_keys_revoked_at ON api_keys(revoked_at);
```

### Audit Logs Table

```sql
CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  key_id TEXT NOT NULL,
  method TEXT NOT NULL, -- GET, POST, PUT, DELETE, PATCH
  path TEXT NOT NULL, -- /api/v1/agents
  status INTEGER NOT NULL, -- 200, 404, 500, etc.
  ip TEXT NOT NULL,
  user_agent TEXT,
  request_body TEXT, -- JSON, truncated to 1KB
  response_time_ms INTEGER,
  timestamp TEXT NOT NULL,
  FOREIGN KEY (key_id) REFERENCES api_keys(id) ON DELETE CASCADE
);

CREATE INDEX idx_audit_logs_key_id ON audit_logs(key_id);
CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp);
CREATE INDEX idx_audit_logs_status ON audit_logs(status);
```

## API Key Format

### Structure

```
sk_<base62_encoded_random_bytes>
```

- **Prefix**: `sk_` (secret key)
- **Length**: 46 characters total (3 + 43)
- **Encoding**: Base62 (alphanumeric, no special chars)
- **Entropy**: 32 random bytes = 256 bits

### Generation

```typescript
import crypto from 'node:crypto';

const BASE62_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

function base62Encode(buffer: Buffer): string {
  let num = BigInt('0x' + buffer.toString('hex'));
  let result = '';

  while (num > 0n) {
    result = BASE62_CHARS[Number(num % 62n)] + result;
    num = num / 62n;
  }

  return result.padStart(43, '0');
}

export function generateApiKey(): string {
  const randomBytes = crypto.randomBytes(32);
  const encoded = base62Encode(randomBytes);
  return `sk_${encoded}`;
}
```

### Hashing

Store only hashed keys in database (bcrypt with cost factor 10):

```typescript
import bcrypt from 'bcrypt';

const BCRYPT_ROUNDS = 10;

export async function hashApiKey(key: string): Promise<string> {
  return bcrypt.hash(key, BCRYPT_ROUNDS);
}

export async function verifyApiKey(key: string, hash: string): Promise<boolean> {
  return bcrypt.compare(key, hash);
}
```

## Role-Based Access Control (RBAC)

### Roles

| Role | Permissions | Use Case |
|------|-------------|----------|
| `admin` | All operations (CRUD on all resources, key management) | System administrators |
| `user` | Create/read/update/delete agents, tasks, runs; read own keys | Application users |
| `readonly` | Read-only access (GET endpoints only) | Monitoring, dashboards |

### Permission Matrix

| Endpoint | admin | user | readonly |
|----------|-------|------|----------|
| `POST /api/v1/agents` | ✅ | ✅ | ❌ |
| `GET /api/v1/agents` | ✅ | ✅ | ✅ |
| `GET /api/v1/agents/:id` | ✅ | ✅ | ✅ |
| `DELETE /api/v1/agents/:id` | ✅ | ✅ | ❌ |
| `POST /api/v1/tasks` | ✅ | ✅ | ❌ |
| `GET /api/v1/runs/:id` | ✅ | ✅ | ✅ |
| `POST /api/v1/keys` | ✅ | ❌ | ❌ |
| `GET /api/v1/keys` | ✅ | ❌ | ❌ |
| `DELETE /api/v1/keys/:id` | ✅ | ❌ | ❌ |
| `GET /api/v1/keys/:id/audit` | ✅ | ❌ | ❌ |
| `GET /health` | ✅ | ✅ | ✅ (no auth) |

### Implementation

```typescript
// Decorator for route handlers
export function requireRole(...allowedRoles: Role[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const apiKey = request.apiKey; // Attached by auth middleware

    if (!apiKey) {
      return reply.status(401).send({
        error: 'UNAUTHORIZED',
        message: 'API key required',
      });
    }

    if (!allowedRoles.includes(apiKey.role)) {
      return reply.status(403).send({
        error: 'FORBIDDEN',
        message: `Insufficient permissions. Required: ${allowedRoles.join(' or ')}`,
      });
    }
  };
}

// Usage in routes
app.post('/api/v1/agents', {
  preHandler: requireRole('admin', 'user'),
}, async (request, reply) => {
  // Handler logic
});

app.post('/api/v1/keys', {
  preHandler: requireRole('admin'),
}, async (request, reply) => {
  // Handler logic
});
```

## Authentication Middleware

### Extract API Key

```typescript
import type { FastifyRequest, FastifyReply } from 'fastify';

export async function authenticateRequest(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Exempt health check
  if (request.url === '/health') {
    return;
  }

  // Extract key from Authorization header or query param
  let apiKey: string | undefined;

  const authHeader = request.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    apiKey = authHeader.substring(7);
  } else if (request.query && typeof request.query === 'object') {
    apiKey = (request.query as Record<string, unknown>).api_key as string;
  }

  if (!apiKey) {
    return reply.status(401).send({
      error: 'UNAUTHORIZED',
      message: 'API key required. Provide via Authorization header or api_key query param.',
    });
  }

  // Validate key format
  if (!apiKey.startsWith('sk_') || apiKey.length !== 46) {
    return reply.status(401).send({
      error: 'INVALID_API_KEY',
      message: 'Invalid API key format',
    });
  }

  // Lookup key in database
  const keyRecord = await apiKeyRepo.findByKey(apiKey);

  if (!keyRecord) {
    return reply.status(401).send({
      error: 'INVALID_API_KEY',
      message: 'API key not found',
    });
  }

  // Check revocation
  if (keyRecord.revokedAt) {
    return reply.status(401).send({
      error: 'API_KEY_REVOKED',
      message: 'API key has been revoked',
    });
  }

  // Check expiration
  if (keyRecord.expiresAt && new Date(keyRecord.expiresAt) < new Date()) {
    return reply.status(401).send({
      error: 'API_KEY_EXPIRED',
      message: 'API key has expired',
    });
  }

  // Attach key metadata to request
  request.apiKey = keyRecord;

  // Update last_used_at asynchronously (don't block request)
  setImmediate(() => {
    apiKeyRepo.updateLastUsed(keyRecord.id).catch(err => {
      logger.error({ error: err, keyId: keyRecord.id }, 'Failed to update last_used_at');
    });
  });
}
```

### Register Middleware

```typescript
// apps/gateway/src/server.ts
import { authenticateRequest } from './middleware/auth';

export async function createServer() {
  const app = fastify();

  // Register authentication middleware globally
  app.addHook('preHandler', authenticateRequest);

  // Register routes
  await app.register(agentRoutes, { prefix: '/api/v1' });
  await app.register(taskRoutes, { prefix: '/api/v1' });
  await app.register(keyRoutes, { prefix: '/api/v1' });

  return app;
}
```

## Rate Limiting

### Configuration

```typescript
import rateLimit from '@fastify/rate-limit';

await app.register(rateLimit, {
  global: true,
  max: 100, // Default: 100 requests per window
  timeWindow: '1 minute',
  keyGenerator: (request) => {
    // Use API key ID as rate limit identifier
    return request.apiKey?.id || request.ip;
  },
  errorResponseBuilder: (request, context) => {
    return {
      error: 'RATE_LIMIT_EXCEEDED',
      message: `Rate limit exceeded. Try again in ${Math.ceil(context.ttl / 1000)} seconds.`,
      retryAfter: Math.ceil(context.ttl / 1000),
    };
  },
});
```

### Per-Role Limits

```typescript
const RATE_LIMITS: Record<Role, { max: number; timeWindow: string }> = {
  admin: { max: 1000, timeWindow: '1 minute' },
  user: { max: 100, timeWindow: '1 minute' },
  readonly: { max: 50, timeWindow: '1 minute' },
};

await app.register(rateLimit, {
  global: true,
  keyGenerator: (request) => request.apiKey?.id || request.ip,
  max: (request) => {
    const role = request.apiKey?.role || 'readonly';
    return RATE_LIMITS[role].max;
  },
  timeWindow: (request) => {
    const role = request.apiKey?.role || 'readonly';
    return RATE_LIMITS[role].timeWindow;
  },
});
```

## Audit Logging

### Log All Requests

```typescript
app.addHook('onResponse', async (request, reply) => {
  // Skip health checks
  if (request.url === '/health') {
    return;
  }

  // Skip if no API key (unauthenticated request)
  if (!request.apiKey) {
    return;
  }

  try {
    await auditLogRepo.create({
      id: randomUUID(),
      keyId: request.apiKey.id,
      method: request.method,
      path: request.url,
      status: reply.statusCode,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
      requestBody: truncateBody(request.body, 1024),
      responseTimeMs: reply.getResponseTime(),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error({ error }, 'Failed to write audit log');
  }
});

function truncateBody(body: unknown, maxLength: number): string | null {
  if (!body) return null;

  const json = JSON.stringify(body);
  if (json.length <= maxLength) {
    return json;
  }

  return json.substring(0, maxLength) + '... (truncated)';
}
```

### Cleanup Old Logs

```typescript
// Run daily cleanup job
setInterval(async () => {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 90); // Keep 90 days

  const deleted = await auditLogRepo.deleteOlderThan(cutoffDate);
  logger.info({ deleted }, 'Cleaned up old audit logs');
}, 24 * 60 * 60 * 1000); // Daily
```

## API Key Management Endpoints

### Create API Key

```
POST /api/v1/keys
Authorization: Bearer sk_admin_key
Content-Type: application/json

{
  "name": "Production API Key",
  "role": "user",
  "expiresAt": "2027-01-01T00:00:00Z"
}

Response: 201 Created
{
  "id": "key-123",
  "key": "sk_abc123...",
  "name": "Production API Key",
  "role": "user",
  "expiresAt": "2027-01-01T00:00:00Z",
  "createdAt": "2026-03-10T12:00:00Z"
}
```

**Important**: The `key` field is only returned once. Store it securely.

### List API Keys

```
GET /api/v1/keys?role=user&revoked=false

Response: 200 OK
[
  {
    "id": "key-123",
    "name": "Production API Key",
    "role": "user",
    "createdAt": "2026-03-10T12:00:00Z",
    "expiresAt": "2027-01-01T00:00:00Z",
    "lastUsedAt": "2026-03-10T14:30:00Z",
    "revokedAt": null
  }
]
```

**Note**: The actual key value is never returned after creation.

### Get API Key

```
GET /api/v1/keys/:id

Response: 200 OK
{
  "id": "key-123",
  "name": "Production API Key",
  "role": "user",
  "createdBy": "admin-key-456",
  "createdAt": "2026-03-10T12:00:00Z",
  "expiresAt": "2027-01-01T00:00:00Z",
  "lastUsedAt": "2026-03-10T14:30:00Z",
  "revokedAt": null
}
```

### Revoke API Key

```
DELETE /api/v1/keys/:id
Content-Type: application/json

{
  "reason": "Key compromised"
}

Response: 200 OK
{
  "id": "key-123",
  "revokedAt": "2026-03-10T15:00:00Z",
  "revokedBy": "admin-key-456",
  "revokedReason": "Key compromised"
}
```

### Get Audit Logs

```
GET /api/v1/keys/:id/audit?limit=100&offset=0

Response: 200 OK
{
  "logs": [
    {
      "id": "log-789",
      "method": "POST",
      "path": "/api/v1/agents",
      "status": 201,
      "ip": "192.168.1.100",
      "timestamp": "2026-03-10T14:30:00Z",
      "responseTimeMs": 45
    }
  ],
  "total": 1523,
  "limit": 100,
  "offset": 0
}
```

## Bootstrap Admin Key

### Generate on First Startup

```typescript
// apps/gateway/src/bootstrap.ts
export async function bootstrapAdminKey(
  apiKeyRepo: IApiKeyRepository
): Promise<void> {
  const existingKeys = await apiKeyRepo.list();

  if (existingKeys.length > 0) {
    logger.info('Admin key already exists, skipping bootstrap');
    return;
  }

  const key = generateApiKey();
  const keyHash = await hashApiKey(key);

  await apiKeyRepo.create({
    id: randomUUID(),
    keyHash,
    name: 'Bootstrap Admin Key',
    role: 'admin',
    createdBy: 'system',
    createdAt: new Date().toISOString(),
    expiresAt: null,
    lastUsedAt: null,
    revokedAt: null,
  });

  console.log('\n' + '='.repeat(60));
  console.log('🔑 BOOTSTRAP ADMIN API KEY (save this securely):');
  console.log('\n' + key + '\n');
  console.log('This key will NOT be displayed again.');
  console.log('Use it to create additional API keys via the API.');
  console.log('='.repeat(60) + '\n');
}
```

## Security Best Practices

### Key Storage

- **Never log API keys** (mask in logs: `sk_abc...xyz`)
- **Store only hashed keys** in database (bcrypt)
- **Display key only once** on creation
- **Use HTTPS** for all API requests

### Key Rotation

- **Set expiration dates** for keys (e.g., 90 days)
- **Rotate keys regularly** (before expiration)
- **Revoke compromised keys** immediately

### Rate Limiting

- **Per-key limits** prevent abuse
- **Exponential backoff** for clients
- **Monitor rate limit hits** for anomalies

### Audit Logging

- **Log all authenticated requests** (method, path, status, IP)
- **Retain logs for 90 days** (compliance)
- **Alert on suspicious patterns** (many 401s, unusual IPs)

## Testing

### Unit Tests

```typescript
describe('API Key Generation', () => {
  it('generates valid API key format', () => {
    const key = generateApiKey();
    expect(key).toMatch(/^sk_[A-Za-z0-9]{43}$/);
  });

  it('hashes and verifies API key', async () => {
    const key = generateApiKey();
    const hash = await hashApiKey(key);
    expect(await verifyApiKey(key, hash)).toBe(true);
    expect(await verifyApiKey('sk_wrong', hash)).toBe(false);
  });
});
```

### Integration Tests

```typescript
describe('Authentication Middleware', () => {
  it('accepts valid API key', async () => {
    const key = await createTestApiKey({ role: 'user' });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/agents',
      headers: {
        Authorization: `Bearer ${key.key}`,
      },
    });

    expect(response.statusCode).toBe(200);
  });

  it('rejects invalid API key', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/agents',
      headers: {
        Authorization: 'Bearer sk_invalid',
      },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error).toBe('INVALID_API_KEY');
  });

  it('rejects revoked API key', async () => {
    const key = await createTestApiKey({ role: 'user' });
    await apiKeyRepo.revoke(key.id, 'admin', 'Test revocation');

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/agents',
      headers: {
        Authorization: `Bearer ${key.key}`,
      },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error).toBe('API_KEY_REVOKED');
  });
});

describe('Authorization', () => {
  it('allows admin to create keys', async () => {
    const adminKey = await createTestApiKey({ role: 'admin' });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/keys',
      headers: {
        Authorization: `Bearer ${adminKey.key}`,
      },
      payload: {
        name: 'New Key',
        role: 'user',
      },
    });

    expect(response.statusCode).toBe(201);
  });

  it('forbids user from creating keys', async () => {
    const userKey = await createTestApiKey({ role: 'user' });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/keys',
      headers: {
        Authorization: `Bearer ${userKey.key}`,
      },
      payload: {
        name: 'New Key',
        role: 'user',
      },
    });

    expect(response.statusCode).toBe(403);
  });

  it('allows readonly to GET but not POST', async () => {
    const readonlyKey = await createTestApiKey({ role: 'readonly' });

    const getResponse = await app.inject({
      method: 'GET',
      url: '/api/v1/agents',
      headers: {
        Authorization: `Bearer ${readonlyKey.key}`,
      },
    });
    expect(getResponse.statusCode).toBe(200);

    const postResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/agents',
      headers: {
        Authorization: `Bearer ${readonlyKey.key}`,
      },
      payload: { name: 'Test' },
    });
    expect(postResponse.statusCode).toBe(403);
  });
});
```

## Migration Guide

### Breaking Change

All API endpoints now require authentication (except `/health`).

### Migration Steps

1. **Start gateway** → Bootstrap admin key is printed to console
2. **Save admin key** securely (password manager, secrets vault)
3. **Create user keys** via API using admin key
4. **Update clients** (web console, CLI, SDKs) to include API key
5. **Test authentication** with new keys
6. **Revoke old keys** if rotating

### Web Console Integration

```typescript
// apps/web/src/lib/api.ts
const API_KEY = localStorage.getItem('senclaw_api_key');

async function fetchJSON<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
      ...options?.headers,
    },
  });

  // Handle 401 → redirect to login
  if (response.status === 401) {
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }

  return response.json();
}
```

### CLI Integration

```typescript
// packages/cli/src/config.ts
export function getApiKey(): string {
  const key = process.env.SENCLAW_API_KEY || readFromConfig();

  if (!key) {
    console.error('API key not found. Set SENCLAW_API_KEY or run: senclaw config set api_key <key>');
    process.exit(1);
  }

  return key;
}
```

## Configuration

### Environment Variables

```bash
# Optional: Override default rate limits
SENCLAW_RATE_LIMIT_ADMIN=1000
SENCLAW_RATE_LIMIT_USER=100
SENCLAW_RATE_LIMIT_READONLY=50

# Optional: Audit log retention (days)
SENCLAW_AUDIT_LOG_RETENTION_DAYS=90
```

## Observability

### Metrics

- `api_requests_total{key_id, role, method, path, status}`
- `api_request_duration_seconds{key_id, role, method, path}`
- `api_rate_limit_exceeded_total{key_id, role}`
- `api_keys_total{role, revoked}`
- `api_keys_expired_total`

### Logging

```typescript
logger.info({
  keyId: request.apiKey.id,
  role: request.apiKey.role,
  method: request.method,
  path: request.url,
  status: reply.statusCode,
  duration: reply.getResponseTime(),
}, 'API request');
```

### Alerts

- **High 401 rate** → Possible brute force attack
- **High 403 rate** → Misconfigured client permissions
- **High 429 rate** → Client exceeding rate limits
- **Unusual IP** → Key used from unexpected location
