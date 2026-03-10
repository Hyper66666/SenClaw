# Role-Based Access Control (RBAC) Specification

## Overview

RBAC restricts API access based on the role assigned to each API key. Three roles are supported: `admin`, `user`, and `readonly`.

## Roles and Permissions

### Admin Role

**Permissions**: Full access to all resources

- ✅ All agent operations (create, read, update, delete)
- ✅ All task operations (submit, read)
- ✅ All run operations (read, cancel)
- ✅ All connector operations (create, read, update, delete)
- ✅ All scheduled job operations (create, read, update, delete)
- ✅ API key management (create, read, revoke)
- ✅ Audit log access

**Use Cases**: System administrators, DevOps engineers

### User Role

**Permissions**: Standard application access

- ✅ Agent operations (create, read, update, delete)
- ✅ Task operations (submit, read)
- ✅ Run operations (read, cancel)
- ✅ Connector operations (create, read, update, delete)
- ✅ Scheduled job operations (create, read, update, delete)
- ❌ API key management
- ❌ Audit log access

**Use Cases**: Application developers, automation scripts

### Readonly Role

**Permissions**: Read-only access

- ✅ Agent operations (read only)
- ✅ Run operations (read only)
- ✅ Connector operations (read only)
- ✅ Scheduled job operations (read only)
- ❌ Any write operations (POST, PUT, PATCH, DELETE)
- ❌ API key management
- ❌ Audit log access

**Use Cases**: Monitoring dashboards, reporting tools

## Permission Matrix

| Endpoint | Method | admin | user | readonly |
|----------|--------|-------|------|----------|
| `/api/v1/agents` | POST | ✅ | ✅ | ❌ |
| `/api/v1/agents` | GET | ✅ | ✅ | ✅ |
| `/api/v1/agents/:id` | GET | ✅ | ✅ | ✅ |
| `/api/v1/agents/:id` | DELETE | ✅ | ✅ | ❌ |
| `/api/v1/tasks` | POST | ✅ | ✅ | ❌ |
| `/api/v1/runs/:id` | GET | ✅ | ✅ | ✅ |
| `/api/v1/runs/:id/messages` | GET | ✅ | ✅ | ✅ |
| `/api/v1/connectors` | POST | ✅ | ✅ | ❌ |
| `/api/v1/connectors` | GET | ✅ | ✅ | ✅ |
| `/api/v1/connectors/:id` | DELETE | ✅ | ✅ | ❌ |
| `/api/v1/jobs` | POST | ✅ | ✅ | ❌ |
| `/api/v1/jobs` | GET | ✅ | ✅ | ✅ |
| `/api/v1/jobs/:id` | DELETE | ✅ | ✅ | ❌ |
| `/api/v1/keys` | POST | ✅ | ❌ | ❌ |
| `/api/v1/keys` | GET | ✅ | ❌ | ❌ |
| `/api/v1/keys/:id` | DELETE | ✅ | ❌ | ❌ |
| `/api/v1/keys/:id/audit` | GET | ✅ | ❌ | ❌ |
| `/health` | GET | ✅ | ✅ | ✅ (no auth) |

## Implementation

### Authorization Decorator

```typescript
import type { FastifyRequest, FastifyReply } from 'fastify';

export type Role = 'admin' | 'user' | 'readonly';

export function requireRole(...allowedRoles: Role[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const apiKey = request.apiKey;

    if (!apiKey) {
      return reply.status(401).send({
        error: 'UNAUTHORIZED',
        message: 'API key required',
      });
    }

    if (!allowedRoles.includes(apiKey.role)) {
      return reply.status(403).send({
        error: 'FORBIDDEN',
        message: `Insufficient permissions. Required role: ${allowedRoles.join(' or ')}. Your role: ${apiKey.role}`,
      });
    }
  };
}
```

### Route Registration

```typescript
// Admin-only routes
app.post('/api/v1/keys', {
  preHandler: requireRole('admin'),
}, createApiKeyHandler);

app.get('/api/v1/keys', {
  preHandler: requireRole('admin'),
}, listApiKeysHandler);

// User and admin routes
app.post('/api/v1/agents', {
  preHandler: requireRole('admin', 'user'),
}, createAgentHandler);

app.delete('/api/v1/agents/:id', {
  preHandler: requireRole('admin', 'user'),
}, deleteAgentHandler);

// All authenticated users (including readonly)
app.get('/api/v1/agents', {
  preHandler: requireRole('admin', 'user', 'readonly'),
}, listAgentsHandler);

app.get('/api/v1/runs/:id', {
  preHandler: requireRole('admin', 'user', 'readonly'),
}, getRunHandler);
```

### Method-Based Authorization

For routes that support multiple methods, apply role checks per method:

```typescript
app.route({
  method: ['GET', 'POST'],
  url: '/api/v1/agents',
  preHandler: async (request, reply) => {
    if (request.method === 'GET') {
      await requireRole('admin', 'user', 'readonly')(request, reply);
    } else if (request.method === 'POST') {
      await requireRole('admin', 'user')(request, reply);
    }
  },
  handler: async (request, reply) => {
    if (request.method === 'GET') {
      return listAgentsHandler(request, reply);
    } else {
      return createAgentHandler(request, reply);
    }
  },
});
```

## Error Responses

### 401 Unauthorized

Missing or invalid API key:

```json
{
  "error": "UNAUTHORIZED",
  "message": "API key required"
}
```

### 403 Forbidden

Valid API key but insufficient permissions:

```json
{
  "error": "FORBIDDEN",
  "message": "Insufficient permissions. Required role: admin. Your role: user"
}
```

## Testing

```typescript
describe('RBAC', () => {
  it('allows admin to create API keys', async () => {
    const adminKey = await createTestApiKey({ role: 'admin' });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/keys',
      headers: { Authorization: `Bearer ${adminKey.key}` },
      payload: { name: 'Test', role: 'user' },
    });

    expect(response.statusCode).toBe(201);
  });

  it('forbids user from creating API keys', async () => {
    const userKey = await createTestApiKey({ role: 'user' });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/keys',
      headers: { Authorization: `Bearer ${userKey.key}` },
      payload: { name: 'Test', role: 'user' },
    });

    expect(response.statusCode).toBe(403);
  });

  it('allows user to create agents', async () => {
    const userKey = await createTestApiKey({ role: 'user' });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/agents',
      headers: { Authorization: `Bearer ${userKey.key}` },
      payload: { name: 'Test Agent', systemPrompt: 'Test' },
    });

    expect(response.statusCode).toBe(201);
  });

  it('forbids readonly from creating agents', async () => {
    const readonlyKey = await createTestApiKey({ role: 'readonly' });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/agents',
      headers: { Authorization: `Bearer ${readonlyKey.key}` },
      payload: { name: 'Test Agent', systemPrompt: 'Test' },
    });

    expect(response.statusCode).toBe(403);
  });

  it('allows readonly to read agents', async () => {
    const readonlyKey = await createTestApiKey({ role: 'readonly' });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/agents',
      headers: { Authorization: `Bearer ${readonlyKey.key}` },
    });

    expect(response.statusCode).toBe(200);
  });
});
```

## Best Practices

1. **Principle of least privilege**: Assign minimum required role
2. **Use readonly for monitoring**: Dashboards, metrics collectors
3. **Limit admin keys**: Only for trusted administrators
4. **Audit role changes**: Log when keys are created with specific roles
5. **Document role requirements**: Clearly communicate what each role can do
6. **Test authorization**: Verify all role combinations in tests
