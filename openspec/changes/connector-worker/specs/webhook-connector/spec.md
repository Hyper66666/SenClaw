# Webhook Connector Specification

## Overview

The Webhook Connector receives HTTP POST requests from external services and transforms them into agent tasks. It supports signature validation for security and provides a public endpoint for each connector.

## Webhook Endpoint

### URL Format

```
POST /webhooks/:connectorId
```

Each connector gets a unique URL based on its ID.

### Request Format

**Headers**:
- `Content-Type: application/json` (required)
- `X-Hub-Signature-256` (optional, for GitHub-style webhooks)
- `X-Slack-Signature` (optional, for Slack webhooks)
- `X-Custom-Signature` (optional, configurable)

**Body**: JSON payload (structure varies by source)

### Response Format

**Success (202 Accepted)**:
```json
{
  "eventId": "event-789",
  "status": "accepted",
  "message": "Event queued for processing"
}
```

**Error (400 Bad Request)**:
```json
{
  "error": "INVALID_SIGNATURE",
  "message": "Webhook signature validation failed"
}
```

**Error (404 Not Found)**:
```json
{
  "error": "CONNECTOR_NOT_FOUND",
  "message": "Connector conn-456 not found"
}
```

**Error (503 Service Unavailable)**:
```json
{
  "error": "CONNECTOR_DISABLED",
  "message": "Connector is disabled"
}
```

## Signature Validation

### GitHub Webhooks

**Configuration**:
```json
{
  "signatureHeader": "X-Hub-Signature-256",
  "signatureAlgorithm": "sha256",
  "secret": "your-webhook-secret"
}
```

**Validation Logic**:
```typescript
function validateGitHubSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payload);
  const expectedSignature = `sha256=${hmac.digest('hex')}`;

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}
```

**Example**:
```bash
# GitHub sends
X-Hub-Signature-256: sha256=abc123...

# We compute
HMAC-SHA256(payload, secret) = abc123...

# Compare with timing-safe equality
```

### Slack Webhooks

**Configuration**:
```json
{
  "signatureHeader": "X-Slack-Signature",
  "signatureAlgorithm": "sha256",
  "secret": "your-signing-secret",
  "timestampHeader": "X-Slack-Request-Timestamp"
}
```

**Validation Logic**:
```typescript
function validateSlackSignature(
  payload: string,
  signature: string,
  timestamp: string,
  secret: string
): boolean {
  // Check timestamp freshness (within 5 minutes)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp)) > 300) {
    return false; // Replay attack protection
  }

  // Compute signature
  const sigBasestring = `v0:${timestamp}:${payload}`;
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(sigBasestring);
  const expectedSignature = `v0=${hmac.digest('hex')}`;

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}
```

### Generic HMAC Signature

**Configuration**:
```json
{
  "signatureHeader": "X-Webhook-Signature",
  "signatureAlgorithm": "sha256", // or "sha1", "sha512"
  "signaturePrefix": "sha256=", // optional
  "secret": "your-secret-key"
}
```

**Validation Logic**:
```typescript
function validateGenericSignature(
  payload: string,
  signature: string,
  config: SignatureConfig
): boolean {
  const hmac = crypto.createHmac(config.signatureAlgorithm, config.secret);
  hmac.update(payload);
  const digest = hmac.digest('hex');

  const expectedSignature = config.signaturePrefix
    ? `${config.signaturePrefix}${digest}`
    : digest;

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}
```

## IP Whitelisting

### Configuration

```json
{
  "allowedIPs": [
    "192.30.252.0/22",  // GitHub webhook IPs
    "140.82.112.0/20",
    "10.0.0.0/8"        // Internal network
  ]
}
```

### Validation Logic

```typescript
import { Address4, Address6 } from 'ip-address';

function isIPAllowed(clientIP: string, allowedRanges: string[]): boolean {
  if (allowedRanges.length === 0) {
    return true; // No whitelist = allow all
  }

  const clientAddr = clientIP.includes(':')
    ? new Address6(clientIP)
    : new Address4(clientIP);

  return allowedRanges.some(range => {
    if (range.includes('/')) {
      // CIDR range
      const [network, prefix] = range.split('/');
      const networkAddr = network.includes(':')
        ? new Address6(`${network}/${prefix}`)
        : new Address4(`${network}/${prefix}`);
      return clientAddr.isInSubnet(networkAddr);
    } else {
      // Single IP
      return clientIP === range;
    }
  });
}
```

## Request Handler Implementation

```typescript
// routes/webhooks.ts
import type { FastifyInstance } from 'fastify';

export async function webhookRoutes(app: FastifyInstance) {
  app.post<{ Params: { connectorId: string } }>(
    '/webhooks/:connectorId',
    {
      config: {
        rawBody: true, // Preserve raw body for signature validation
      },
    },
    async (request, reply) => {
      const { connectorId } = request.params;

      // 1. Lookup connector
      const connector = await connectorRepo.get(connectorId);
      if (!connector) {
        return reply.status(404).send({
          error: 'CONNECTOR_NOT_FOUND',
          message: `Connector ${connectorId} not found`,
        });
      }

      if (!connector.enabled) {
        return reply.status(503).send({
          error: 'CONNECTOR_DISABLED',
          message: 'Connector is disabled',
        });
      }

      // 2. Validate IP (if whitelist configured)
      const clientIP = request.ip;
      if (!isIPAllowed(clientIP, connector.config.allowedIPs || [])) {
        logger.warn({ connectorId, clientIP }, 'IP not whitelisted');
        return reply.status(403).send({
          error: 'IP_NOT_ALLOWED',
          message: 'Your IP is not whitelisted',
        });
      }

      // 3. Validate signature
      const rawBody = request.rawBody; // Raw string for HMAC
      const signature = request.headers[connector.config.signatureHeader.toLowerCase()];

      if (connector.config.secret && signature) {
        const isValid = validateSignature(
          rawBody,
          signature as string,
          connector.config
        );

        if (!isValid) {
          logger.warn({ connectorId }, 'Invalid webhook signature');
          return reply.status(400).send({
            error: 'INVALID_SIGNATURE',
            message: 'Webhook signature validation failed',
          });
        }
      }

      // 4. Queue event for async processing
      const eventId = randomUUID();
      await eventQueue.enqueue({
        eventId,
        connectorId,
        payload: request.body,
        receivedAt: new Date().toISOString(),
      });

      // 5. Return 202 immediately
      return reply.status(202).send({
        eventId,
        status: 'accepted',
        message: 'Event queued for processing',
      });
    }
  );
}
```

## Event Queue

### In-Memory Queue (Simple)

```typescript
class EventQueue {
  private queue: Array<QueuedEvent> = [];
  private processing = false;

  async enqueue(event: QueuedEvent): Promise<void> {
    this.queue.push(event);
    if (!this.processing) {
      this.processQueue();
    }
  }

  private async processQueue(): Promise<void> {
    this.processing = true;

    while (this.queue.length > 0) {
      const event = this.queue.shift()!;
      try {
        await processEvent(event);
      } catch (error) {
        logger.error({ error, eventId: event.eventId }, 'Failed to process event');
      }
    }

    this.processing = false;
  }
}
```

### Redis Queue (Production)

```typescript
import { Queue, Worker } from 'bullmq';

const eventQueue = new Queue('webhook-events', {
  connection: { host: 'localhost', port: 6379 },
});

// Enqueue
await eventQueue.add('process-event', {
  eventId,
  connectorId,
  payload,
});

// Worker
const worker = new Worker('webhook-events', async (job) => {
  await processEvent(job.data);
}, {
  connection: { host: 'localhost', port: 6379 },
  concurrency: 10,
});
```

## Common Webhook Sources

### GitHub

**Events**: `push`, `pull_request`, `issues`, `release`, etc.

**Example Payload** (issue opened):
```json
{
  "action": "opened",
  "issue": {
    "id": 123,
    "number": 42,
    "title": "Bug in login",
    "body": "Steps to reproduce...",
    "user": {
      "login": "alice"
    }
  },
  "repository": {
    "name": "my-repo",
    "full_name": "org/my-repo"
  }
}
```

**Transformation**:
```json
{
  "filters": [
    { "field": "$.action", "operator": "equals", "value": "opened" }
  ],
  "inputTemplate": "New issue #{{body.issue.number}} by {{body.issue.user.login}}: {{body.issue.title}}\n\n{{body.issue.body}}"
}
```

### Slack

**Events**: `message`, `app_mention`, `reaction_added`, etc.

**Example Payload** (app mention):
```json
{
  "type": "event_callback",
  "event": {
    "type": "app_mention",
    "user": "U123456",
    "text": "<@UBOT> help me with this",
    "channel": "C789012"
  }
}
```

**Transformation**:
```json
{
  "filters": [
    { "field": "$.event.type", "operator": "equals", "value": "app_mention" }
  ],
  "jsonPath": "$.event.text"
}
```

### Stripe

**Events**: `payment_intent.succeeded`, `customer.created`, etc.

**Example Payload**:
```json
{
  "type": "payment_intent.succeeded",
  "data": {
    "object": {
      "id": "pi_123",
      "amount": 5000,
      "currency": "usd",
      "customer": "cus_456"
    }
  }
}
```

**Transformation**:
```json
{
  "filters": [
    { "field": "$.type", "operator": "equals", "value": "payment_intent.succeeded" }
  ],
  "inputTemplate": "Payment received: ${{body.data.object.amount}} from customer {{body.data.object.customer}}"
}
```

## Testing

### Unit Tests

```typescript
describe('Webhook Signature Validation', () => {
  it('validates GitHub signature correctly', () => {
    const payload = '{"action":"opened"}';
    const secret = 'test-secret';
    const signature = 'sha256=' + crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    expect(validateGitHubSignature(payload, signature, secret)).toBe(true);
  });

  it('rejects invalid signature', () => {
    const payload = '{"action":"opened"}';
    const secret = 'test-secret';
    const signature = 'sha256=invalid';

    expect(validateGitHubSignature(payload, signature, secret)).toBe(false);
  });
});
```

### Integration Tests

```typescript
describe('Webhook Endpoint', () => {
  it('accepts valid webhook and queues event', async () => {
    const connector = await createTestConnector({
      type: 'webhook',
      config: { secret: 'test-secret' },
    });

    const payload = { action: 'opened' };
    const signature = computeSignature(JSON.stringify(payload), 'test-secret');

    const response = await app.inject({
      method: 'POST',
      url: `/webhooks/${connector.id}`,
      headers: {
        'X-Hub-Signature-256': signature,
      },
      payload,
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({
      status: 'accepted',
      eventId: expect.any(String),
    });
  });

  it('rejects webhook with invalid signature', async () => {
    const connector = await createTestConnector({
      type: 'webhook',
      config: { secret: 'test-secret' },
    });

    const response = await app.inject({
      method: 'POST',
      url: `/webhooks/${connector.id}`,
      headers: {
        'X-Hub-Signature-256': 'sha256=invalid',
      },
      payload: { action: 'opened' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('INVALID_SIGNATURE');
  });
});
```

## Security Best Practices

1. **Always validate signatures** for production webhooks
2. **Use HTTPS** for webhook endpoints (TLS termination at load balancer)
3. **Implement rate limiting** per connector (e.g., 100 req/min)
4. **Log all webhook attempts** (success and failure) for audit
5. **Rotate secrets regularly** (every 90 days)
6. **Use IP whitelisting** when possible (GitHub, Stripe provide IP ranges)
7. **Implement replay attack protection** (timestamp validation for Slack-style webhooks)
8. **Never log secrets** or full payloads (may contain sensitive data)

## Configuration Examples

### GitHub Webhook

```json
{
  "name": "GitHub Issues",
  "type": "webhook",
  "agentId": "agent-123",
  "config": {
    "secret": "github-webhook-secret",
    "signatureHeader": "X-Hub-Signature-256",
    "signatureAlgorithm": "sha256",
    "allowedIPs": ["192.30.252.0/22", "140.82.112.0/20"]
  },
  "transformation": {
    "filters": [
      { "field": "$.action", "operator": "equals", "value": "opened" }
    ],
    "inputTemplate": "New issue: {{body.issue.title}}\n{{body.issue.body}}"
  }
}
```

### Slack App Mention

```json
{
  "name": "Slack Mentions",
  "type": "webhook",
  "agentId": "agent-456",
  "config": {
    "secret": "slack-signing-secret",
    "signatureHeader": "X-Slack-Signature",
    "signatureAlgorithm": "sha256",
    "timestampHeader": "X-Slack-Request-Timestamp"
  },
  "transformation": {
    "filters": [
      { "field": "$.event.type", "operator": "equals", "value": "app_mention" }
    ],
    "jsonPath": "$.event.text"
  }
}
```

### Generic Webhook (No Signature)

```json
{
  "name": "Internal Service",
  "type": "webhook",
  "agentId": "agent-789",
  "config": {
    "allowedIPs": ["10.0.0.0/8"]
  },
  "transformation": {
    "jsonPath": "$.message"
  }
}
```
