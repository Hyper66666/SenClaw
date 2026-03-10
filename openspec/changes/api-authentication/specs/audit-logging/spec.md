# Audit Logging Specification

## Overview

Audit logging records all authenticated API requests for security monitoring, compliance, and debugging. Logs are stored in SQLite and can be queried via API.

## Audit Log Schema

```sql
CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  key_id TEXT NOT NULL,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  status INTEGER NOT NULL,
  ip TEXT NOT NULL,
  user_agent TEXT,
  request_body TEXT,
  response_time_ms INTEGER,
  timestamp TEXT NOT NULL,
  FOREIGN KEY (key_id) REFERENCES api_keys(id) ON DELETE CASCADE
);

CREATE INDEX idx_audit_logs_key_id ON audit_logs(key_id);
CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp);
CREATE INDEX idx_audit_logs_status ON audit_logs(status);
CREATE INDEX idx_audit_logs_method_path ON audit_logs(method, path);
```

## Audit Log Properties

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier (UUID) |
| `keyId` | string | API key ID that made the request |
| `method` | string | HTTP method (GET, POST, etc.) |
| `path` | string | Request path (/api/v1/agents) |
| `status` | number | HTTP status code (200, 404, etc.) |
| `ip` | string | Client IP address |
| `userAgent` | string | User-Agent header |
| `requestBody` | string | Request body (truncated to 1KB) |
| `responseTimeMs` | number | Response time in milliseconds |
| `timestamp` | ISO 8601 | Request timestamp |

## Implementation

### Logging Middleware

```typescript
import type { FastifyRequest, FastifyReply } from 'fastify';

app.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
  // Skip health checks
  if (request.url === '/health') {
    return;
  }

  // Skip unauthenticated requests
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
      userAgent: request.headers['user-agent'] || null,
      requestBody: truncateBody(request.body, 1024),
      responseTimeMs: Math.round(reply.getResponseTime()),
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

### Repository Interface

```typescript
export interface IAuditLogRepository {
  create(data: CreateAuditLog): Promise<AuditLog>;
  listByKeyId(keyId: string, options?: PaginationOptions): Promise<AuditLog[]>;
  countByKeyId(keyId: string): Promise<number>;
  deleteOlderThan(date: Date): Promise<number>;
}

export interface CreateAuditLog {
  id: string;
  keyId: string;
  method: string;
  path: string;
  status: number;
  ip: string;
  userAgent: string | null;
  requestBody: string | null;
  responseTimeMs: number;
  timestamp: string;
}

export interface PaginationOptions {
  limit?: number;
  offset?: number;
}
```

## REST API Endpoint

### Get Audit Logs for API Key

**Endpoint**: `GET /api/v1/keys/:id/audit?limit=100&offset=0`

**Authorization**: Admin only

**Response**: `200 OK`
```json
{
  "logs": [
    {
      "id": "log-abc123",
      "method": "POST",
      "path": "/api/v1/agents",
      "status": 201,
      "ip": "192.168.1.100",
      "userAgent": "Mozilla/5.0...",
      "requestBody": "{\"name\":\"Test Agent\"}",
      "responseTimeMs": 45,
      "timestamp": "2026-03-10T14:30:00Z"
    }
  ],
  "total": 1523,
  "limit": 100,
  "offset": 0
}
```

**Implementation**:
```typescript
app.get<{ Params: { id: string }; Querystring: AuditLogQuery }>(
  '/api/v1/keys/:id/audit',
  {
    preHandler: requireRole('admin'),
  },
  async (request, reply) => {
    const { id } = request.params;
    const { limit = 100, offset = 0 } = request.query;

    const key = await apiKeyRepo.get(id);
    if (!key) {
      return reply.status(404).send({
        error: 'KEY_NOT_FOUND',
        message: `API key ${id} not found`,
      });
    }

    const logs = await auditLogRepo.listByKeyId(id, { limit, offset });
    const total = await auditLogRepo.countByKeyId(id);

    return {
      logs,
      total,
      limit,
      offset,
    };
  }
);
```

## Log Retention

### Automatic Cleanup

Delete logs older than 90 days (configurable):

```typescript
// Run daily cleanup job
setInterval(async () => {
  const retentionDays = parseInt(process.env.SENCLAW_AUDIT_LOG_RETENTION_DAYS || '90');
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

  const deleted = await auditLogRepo.deleteOlderThan(cutoffDate);
  logger.info({ deleted, retentionDays }, 'Cleaned up old audit logs');
}, 24 * 60 * 60 * 1000); // Daily
```

### Configuration

```bash
SENCLAW_AUDIT_LOG_RETENTION_DAYS=90
```

## Security Considerations

### Sensitive Data

- **Truncate request bodies** to 1KB (prevent large payloads)
- **Never log API keys** (even in request bodies)
- **Sanitize sensitive fields** (passwords, tokens)

```typescript
function sanitizeBody(body: unknown): unknown {
  if (!body || typeof body !== 'object') return body;

  const sanitized = { ...body };
  const sensitiveFields = ['password', 'token', 'secret', 'apiKey', 'key'];

  for (const field of sensitiveFields) {
    if (field in sanitized) {
      sanitized[field] = '***REDACTED***';
    }
  }

  return sanitized;
}
```

### Access Control

- **Admin-only access** to audit logs
- **Cannot modify logs** (append-only)
- **Cascade delete** when API key is deleted

## Monitoring and Alerting

### Suspicious Patterns

Monitor audit logs for:

- **High 401 rate** → Possible brute force attack
- **High 403 rate** → Misconfigured permissions
- **Unusual IP addresses** → Key compromise
- **High error rate (5xx)** → System issues

### Example Queries

**Failed authentication attempts**:
```sql
SELECT COUNT(*) FROM audit_logs
WHERE status = 401
AND timestamp > datetime('now', '-1 hour');
```

**Requests from unusual IPs**:
```sql
SELECT DISTINCT ip FROM audit_logs
WHERE key_id = 'key-123'
AND ip NOT IN ('192.168.1.100', '10.0.0.50');
```

**Slow requests**:
```sql
SELECT method, path, AVG(response_time_ms) as avg_time
FROM audit_logs
WHERE timestamp > datetime('now', '-1 day')
GROUP BY method, path
HAVING avg_time > 1000
ORDER BY avg_time DESC;
```

## Testing

```typescript
describe('Audit Logging', () => {
  it('logs authenticated requests', async () => {
    const userKey = await createTestApiKey({ role: 'user' });

    await app.inject({
      method: 'GET',
      url: '/api/v1/agents',
      headers: { Authorization: `Bearer ${userKey.key}` },
    });

    const logs = await auditLogRepo.listByKeyId(userKey.id);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      keyId: userKey.id,
      method: 'GET',
      path: '/api/v1/agents',
      status: 200,
    });
  });

  it('does not log health checks', async () => {
    await app.inject({
      method: 'GET',
      url: '/health',
    });

    const allLogs = await auditLogRepo.listByKeyId('any-key');
    expect(allLogs).toHaveLength(0);
  });

  it('truncates large request bodies', async () => {
    const userKey = await createTestApiKey({ role: 'user' });
    const largeBody = { data: 'x'.repeat(2000) };

    await app.inject({
      method: 'POST',
      url: '/api/v1/agents',
      headers: { Authorization: `Bearer ${userKey.key}` },
      payload: largeBody,
    });

    const logs = await auditLogRepo.listByKeyId(userKey.id);
    expect(logs[0].requestBody?.length).toBeLessThanOrEqual(1024 + 20); // +20 for "... (truncated)"
  });

  it('deletes old logs', async () => {
    const oldDate = new Date('2025-01-01');
    await auditLogRepo.create({
      id: 'log-old',
      keyId: 'key-123',
      method: 'GET',
      path: '/test',
      status: 200,
      ip: '127.0.0.1',
      userAgent: null,
      requestBody: null,
      responseTimeMs: 10,
      timestamp: oldDate.toISOString(),
    });

    const cutoff = new Date('2026-01-01');
    const deleted = await auditLogRepo.deleteOlderThan(cutoff);

    expect(deleted).toBe(1);
  });
});
```

## Best Practices

1. **Log all authenticated requests** (except health checks)
2. **Truncate large payloads** to prevent storage bloat
3. **Sanitize sensitive data** (passwords, tokens)
4. **Set retention policy** (e.g., 90 days)
5. **Monitor for anomalies** (unusual IPs, high error rates)
6. **Restrict access** to admin role only
7. **Use for compliance** (SOC 2, GDPR audit trails)
8. **Index frequently queried fields** (key_id, timestamp, status)
