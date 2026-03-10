# API Key Management Specification

## Overview

API key management provides CRUD operations for creating, listing, revoking, and auditing API keys. Only admin users can manage keys.

## API Key Lifecycle

```
Created → Active → Revoked
          ↓
       Expired
```

## API Key Properties

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier (UUID) |
| `keyHash` | string | Bcrypt hash of the key (never exposed) |
| `name` | string | Human-readable name |
| `role` | enum | `admin`, `user`, or `readonly` |
| `createdBy` | string | Key ID of creator or `system` |
| `createdAt` | ISO 8601 | Creation timestamp |
| `expiresAt` | ISO 8601 | Expiration timestamp (null = never) |
| `lastUsedAt` | ISO 8601 | Last usage timestamp |
| `revokedAt` | ISO 8601 | Revocation timestamp (null = active) |
| `revokedBy` | string | Key ID of revoker |
| `revokedReason` | string | Reason for revocation |

## Repository Interface

```typescript
export interface IApiKeyRepository {
  create(data: CreateApiKey): Promise<ApiKey>;
  get(id: string): Promise<ApiKey | null>;
  findByKeyHash(keyHash: string): Promise<ApiKey | null>;
  list(filters?: ApiKeyFilters): Promise<ApiKey[]>;
  updateLastUsed(id: string): Promise<void>;
  revoke(id: string, revokedBy: string, reason: string): Promise<ApiKey>;
  deleteExpired(): Promise<number>;
}

export interface CreateApiKey {
  id: string;
  keyHash: string;
  name: string;
  role: Role;
  createdBy: string;
  createdAt: string;
  expiresAt: string | null;
}

export interface ApiKeyFilters {
  role?: Role;
  revoked?: boolean;
  expired?: boolean;
}
```

## Implementation

```typescript
// packages/storage/src/api-key-repository.ts
import { eq, and, isNull, isNotNull, lt } from 'drizzle-orm';
import type { IApiKeyRepository, CreateApiKey, ApiKey, ApiKeyFilters } from '@senclaw/protocol';
import { db } from './db';
import { apiKeys } from './schema';

export class SqliteApiKeyRepository implements IApiKeyRepository {
  async create(data: CreateApiKey): Promise<ApiKey> {
    await db.insert(apiKeys).values({
      ...data,
      lastUsedAt: null,
      revokedAt: null,
      revokedBy: null,
      revokedReason: null,
    });

    return this.get(data.id) as Promise<ApiKey>;
  }

  async get(id: string): Promise<ApiKey | null> {
    const result = await db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.id, id))
      .get();

    return result || null;
  }

  async findByKeyHash(keyHash: string): Promise<ApiKey | null> {
    const result = await db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.keyHash, keyHash))
      .get();

    return result || null;
  }

  async list(filters?: ApiKeyFilters): Promise<ApiKey[]> {
    let query = db.select().from(apiKeys);

    const conditions = [];

    if (filters?.role) {
      conditions.push(eq(apiKeys.role, filters.role));
    }

    if (filters?.revoked === true) {
      conditions.push(isNotNull(apiKeys.revokedAt));
    } else if (filters?.revoked === false) {
      conditions.push(isNull(apiKeys.revokedAt));
    }

    if (filters?.expired === true) {
      conditions.push(lt(apiKeys.expiresAt, new Date().toISOString()));
    } else if (filters?.expired === false) {
      conditions.push(
        or(
          isNull(apiKeys.expiresAt),
          gt(apiKeys.expiresAt, new Date().toISOString())
        )
      );
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    return query.all();
  }

  async updateLastUsed(id: string): Promise<void> {
    await db
      .update(apiKeys)
      .set({ lastUsedAt: new Date().toISOString() })
      .where(eq(apiKeys.id, id));
  }

  async revoke(id: string, revokedBy: string, reason: string): Promise<ApiKey> {
    await db
      .update(apiKeys)
      .set({
        revokedAt: new Date().toISOString(),
        revokedBy,
        revokedReason: reason,
      })
      .where(eq(apiKeys.id, id));

    return this.get(id) as Promise<ApiKey>;
  }

  async deleteExpired(): Promise<number> {
    const result = await db
      .delete(apiKeys)
      .where(
        and(
          isNotNull(apiKeys.expiresAt),
          lt(apiKeys.expiresAt, new Date().toISOString())
        )
      );

    return result.changes;
  }
}
```

## REST API Routes

### Create API Key

**Endpoint**: `POST /api/v1/keys`

**Authorization**: Admin only

**Request**:
```json
{
  "name": "Production API Key",
  "role": "user",
  "expiresAt": "2027-01-01T00:00:00Z"
}
```

**Response**: `201 Created`
```json
{
  "id": "key-abc123",
  "key": "sk_xyz789...",
  "name": "Production API Key",
  "role": "user",
  "createdAt": "2026-03-10T12:00:00Z",
  "expiresAt": "2027-01-01T00:00:00Z"
}
```

**Implementation**:
```typescript
app.post<{ Body: CreateApiKeyRequest }>(
  '/api/v1/keys',
  {
    preHandler: requireRole('admin'),
    schema: {
      body: CreateApiKeySchema,
    },
  },
  async (request, reply) => {
    const { name, role, expiresAt } = request.body;

    // Generate key
    const key = generateApiKey();
    const keyHash = await hashApiKey(key);

    // Create in database
    const apiKey = await apiKeyRepo.create({
      id: randomUUID(),
      keyHash,
      name,
      role,
      createdBy: request.apiKey!.id,
      createdAt: new Date().toISOString(),
      expiresAt: expiresAt || null,
    });

    // Return key (only time it's exposed)
    return reply.status(201).send({
      id: apiKey.id,
      key, // ⚠️ Only returned once
      name: apiKey.name,
      role: apiKey.role,
      createdAt: apiKey.createdAt,
      expiresAt: apiKey.expiresAt,
    });
  }
);
```

### List API Keys

**Endpoint**: `GET /api/v1/keys?role=user&revoked=false`

**Authorization**: Admin only

**Response**: `200 OK`
```json
[
  {
    "id": "key-abc123",
    "name": "Production API Key",
    "role": "user",
    "createdBy": "key-admin",
    "createdAt": "2026-03-10T12:00:00Z",
    "expiresAt": "2027-01-01T00:00:00Z",
    "lastUsedAt": "2026-03-10T14:30:00Z",
    "revokedAt": null
  }
]
```

**Implementation**:
```typescript
app.get<{ Querystring: ListApiKeysQuery }>(
  '/api/v1/keys',
  {
    preHandler: requireRole('admin'),
  },
  async (request, reply) => {
    const { role, revoked } = request.query;

    const keys = await apiKeyRepo.list({
      role: role as Role,
      revoked: revoked === 'true' ? true : revoked === 'false' ? false : undefined,
    });

    // Never expose key hash
    return keys.map(key => ({
      id: key.id,
      name: key.name,
      role: key.role,
      createdBy: key.createdBy,
      createdAt: key.createdAt,
      expiresAt: key.expiresAt,
      lastUsedAt: key.lastUsedAt,
      revokedAt: key.revokedAt,
      revokedBy: key.revokedBy,
      revokedReason: key.revokedReason,
    }));
  }
);
```

### Get API Key

**Endpoint**: `GET /api/v1/keys/:id`

**Authorization**: Admin only

**Response**: `200 OK`
```json
{
  "id": "key-abc123",
  "name": "Production API Key",
  "role": "user",
  "createdBy": "key-admin",
  "createdAt": "2026-03-10T12:00:00Z",
  "expiresAt": "2027-01-01T00:00:00Z",
  "lastUsedAt": "2026-03-10T14:30:00Z",
  "revokedAt": null
}
```

**Implementation**:
```typescript
app.get<{ Params: { id: string } }>(
  '/api/v1/keys/:id',
  {
    preHandler: requireRole('admin'),
  },
  async (request, reply) => {
    const { id } = request.params;

    const key = await apiKeyRepo.get(id);

    if (!key) {
      return reply.status(404).send({
        error: 'KEY_NOT_FOUND',
        message: `API key ${id} not found`,
      });
    }

    return {
      id: key.id,
      name: key.name,
      role: key.role,
      createdBy: key.createdBy,
      createdAt: key.createdAt,
      expiresAt: key.expiresAt,
      lastUsedAt: key.lastUsedAt,
      revokedAt: key.revokedAt,
      revokedBy: key.revokedBy,
      revokedReason: key.revokedReason,
    };
  }
);
```

### Revoke API Key

**Endpoint**: `DELETE /api/v1/keys/:id`

**Authorization**: Admin only

**Request**:
```json
{
  "reason": "Key compromised"
}
```

**Response**: `200 OK`
```json
{
  "id": "key-abc123",
  "revokedAt": "2026-03-10T15:00:00Z",
  "revokedBy": "key-admin",
  "revokedReason": "Key compromised"
}
```

**Implementation**:
```typescript
app.delete<{ Params: { id: string }; Body: RevokeApiKeyRequest }>(
  '/api/v1/keys/:id',
  {
    preHandler: requireRole('admin'),
    schema: {
      body: RevokeApiKeySchema,
    },
  },
  async (request, reply) => {
    const { id } = request.params;
    const { reason } = request.body;

    const key = await apiKeyRepo.get(id);

    if (!key) {
      return reply.status(404).send({
        error: 'KEY_NOT_FOUND',
        message: `API key ${id} not found`,
      });
    }

    if (key.revokedAt) {
      return reply.status(400).send({
        error: 'KEY_ALREADY_REVOKED',
        message: 'API key is already revoked',
      });
    }

    const revoked = await apiKeyRepo.revoke(id, request.apiKey!.id, reason);

    return {
      id: revoked.id,
      revokedAt: revoked.revokedAt,
      revokedBy: revoked.revokedBy,
      revokedReason: revoked.revokedReason,
    };
  }
);
```

## Validation Schemas

```typescript
import { z } from 'zod';

export const CreateApiKeySchema = z.object({
  name: z.string().min(1).max(100),
  role: z.enum(['admin', 'user', 'readonly']),
  expiresAt: z.string().datetime().optional(),
});

export const RevokeApiKeySchema = z.object({
  reason: z.string().min(1).max(500),
});

export type CreateApiKeyRequest = z.infer<typeof CreateApiKeySchema>;
export type RevokeApiKeyRequest = z.infer<typeof RevokeApiKeySchema>;
```

## Security Considerations

### Key Storage

- **Never store plaintext keys** in database
- **Hash with bcrypt** (cost factor 10)
- **Never log keys** (mask in logs: `sk_abc...xyz`)

### Key Exposure

- **Display key only once** on creation
- **Never return key** in list/get endpoints
- **Warn user** to save key securely

### Key Revocation

- **Immediate effect** (checked on every request)
- **Cannot be undone** (create new key instead)
- **Audit trail** (who revoked, when, why)

### Key Expiration

- **Optional expiration** (null = never expires)
- **Checked on every request** (return 401 if expired)
- **Cleanup job** deletes expired keys (optional)

## Testing

### Unit Tests

```typescript
describe('ApiKeyRepository', () => {
  it('creates API key', async () => {
    const key = await apiKeyRepo.create({
      id: 'key-123',
      keyHash: 'hash',
      name: 'Test Key',
      role: 'user',
      createdBy: 'admin',
      createdAt: new Date().toISOString(),
      expiresAt: null,
    });

    expect(key.id).toBe('key-123');
    expect(key.name).toBe('Test Key');
  });

  it('finds key by hash', async () => {
    const keyHash = await hashApiKey('sk_test');
    await apiKeyRepo.create({
      id: 'key-123',
      keyHash,
      name: 'Test Key',
      role: 'user',
      createdBy: 'admin',
      createdAt: new Date().toISOString(),
      expiresAt: null,
    });

    const found = await apiKeyRepo.findByKeyHash(keyHash);
    expect(found?.id).toBe('key-123');
  });

  it('revokes key', async () => {
    const key = await createTestApiKey();
    const revoked = await apiKeyRepo.revoke(key.id, 'admin', 'Test');

    expect(revoked.revokedAt).toBeTruthy();
    expect(revoked.revokedBy).toBe('admin');
    expect(revoked.revokedReason).toBe('Test');
  });
});
```

### Integration Tests

```typescript
describe('API Key Management', () => {
  it('creates API key (admin)', async () => {
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
    expect(response.json()).toMatchObject({
      id: expect.any(String),
      key: expect.stringMatching(/^sk_[A-Za-z0-9]{43}$/),
      name: 'New Key',
      role: 'user',
    });
  });

  it('forbids non-admin from creating keys', async () => {
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

  it('lists API keys (admin)', async () => {
    const adminKey = await createTestApiKey({ role: 'admin' });
    await createTestApiKey({ role: 'user', name: 'User Key 1' });
    await createTestApiKey({ role: 'user', name: 'User Key 2' });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/keys?role=user',
      headers: {
        Authorization: `Bearer ${adminKey.key}`,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveLength(2);
    expect(response.json()[0]).not.toHaveProperty('key'); // Never exposed
  });

  it('revokes API key', async () => {
    const adminKey = await createTestApiKey({ role: 'admin' });
    const userKey = await createTestApiKey({ role: 'user' });

    const response = await app.inject({
      method: 'DELETE',
      url: `/api/v1/keys/${userKey.id}`,
      headers: {
        Authorization: `Bearer ${adminKey.key}`,
      },
      payload: {
        reason: 'Test revocation',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: userKey.id,
      revokedAt: expect.any(String),
      revokedBy: adminKey.id,
      revokedReason: 'Test revocation',
    });

    // Verify revoked key cannot be used
    const testResponse = await app.inject({
      method: 'GET',
      url: '/api/v1/agents',
      headers: {
        Authorization: `Bearer ${userKey.key}`,
      },
    });

    expect(testResponse.statusCode).toBe(401);
    expect(testResponse.json().error).toBe('API_KEY_REVOKED');
  });
});
```

## Best Practices

1. **Set expiration dates** for all keys (e.g., 90 days)
2. **Rotate keys regularly** before expiration
3. **Use descriptive names** (e.g., "Production Web Console", "CI/CD Pipeline")
4. **Revoke immediately** if key is compromised
5. **Monitor key usage** via audit logs
6. **Limit admin keys** (only for trusted administrators)
7. **Use readonly keys** for monitoring/dashboards
8. **Never commit keys** to version control
9. **Store keys securely** (password manager, secrets vault)
10. **Audit key access** regularly (who has what permissions)
