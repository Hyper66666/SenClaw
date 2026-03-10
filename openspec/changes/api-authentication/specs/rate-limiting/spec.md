# Rate Limiting Specification

## Overview

Rate limiting prevents API abuse by restricting the number of requests per API key within a time window. Different roles have different limits.

## Rate Limits by Role

| Role | Requests per Minute | Requests per Hour |
|------|---------------------|-------------------|
| `admin` | 1000 | 60,000 |
| `user` | 100 | 6,000 |
| `readonly` | 50 | 3,000 |

## Implementation

### Using @fastify/rate-limit

```typescript
import rateLimit from '@fastify/rate-limit';

await app.register(rateLimit, {
  global: true,
  max: (request) => {
    const role = request.apiKey?.role || 'readonly';
    return RATE_LIMITS[role].max;
  },
  timeWindow: '1 minute',
  keyGenerator: (request) => {
    // Use API key ID as identifier
    return request.apiKey?.id || request.ip;
  },
  errorResponseBuilder: (request, context) => {
    return {
      error: 'RATE_LIMIT_EXCEEDED',
      message: `Rate limit exceeded. Try again in ${Math.ceil(context.ttl / 1000)} seconds.`,
      retryAfter: Math.ceil(context.ttl / 1000),
      limit: context.max,
      remaining: 0,
    };
  },
  addHeaders: {
    'x-ratelimit-limit': true,
    'x-ratelimit-remaining': true,
    'x-ratelimit-reset': true,
  },
});

const RATE_LIMITS: Record<Role, { max: number }> = {
  admin: { max: 1000 },
  user: { max: 100 },
  readonly: { max: 50 },
};
```

## Response Headers

Every response includes rate limit headers:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1678454400
```

## Error Response

When rate limit is exceeded:

**Status**: `429 Too Many Requests`

```json
{
  "error": "RATE_LIMIT_EXCEEDED",
  "message": "Rate limit exceeded. Try again in 42 seconds.",
  "retryAfter": 42,
  "limit": 100,
  "remaining": 0
}
```

## Client Handling

### Exponential Backoff

```typescript
async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const response = await fetch(url, options);

    if (response.status === 429) {
      const retryAfter = parseInt(response.headers.get('retry-after') || '60');
      const delay = Math.min(retryAfter * 1000, 60000); // Max 60s
      await new Promise(resolve => setTimeout(resolve, delay));
      continue;
    }

    return response;
  }

  throw new Error('Max retries exceeded');
}
```

## Configuration

Override default limits via environment variables:

```bash
SENCLAW_RATE_LIMIT_ADMIN=1000
SENCLAW_RATE_LIMIT_USER=100
SENCLAW_RATE_LIMIT_READONLY=50
```

## Testing

```typescript
describe('Rate Limiting', () => {
  it('enforces rate limit for user role', async () => {
    const userKey = await createTestApiKey({ role: 'user' });

    // Make 100 requests (at limit)
    for (let i = 0; i < 100; i++) {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/agents',
        headers: { Authorization: `Bearer ${userKey.key}` },
      });
      expect(response.statusCode).toBe(200);
    }

    // 101st request should be rate limited
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/agents',
      headers: { Authorization: `Bearer ${userKey.key}` },
    });

    expect(response.statusCode).toBe(429);
    expect(response.json().error).toBe('RATE_LIMIT_EXCEEDED');
  });

  it('includes rate limit headers', async () => {
    const userKey = await createTestApiKey({ role: 'user' });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/agents',
      headers: { Authorization: `Bearer ${userKey.key}` },
    });

    expect(response.headers['x-ratelimit-limit']).toBe('100');
    expect(response.headers['x-ratelimit-remaining']).toBe('99');
    expect(response.headers['x-ratelimit-reset']).toBeDefined();
  });
});
```
