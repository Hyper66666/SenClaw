# Connector Worker — Design Document

## Overview

The Connector Worker is a service that bridges external event sources with Senclaw agents. It receives events from webhooks, message queues, or polling sources, transforms them into agent task inputs, and submits tasks to the gateway.

## Architecture

### High-Level Structure

```
┌─────────────────────────────────────────────────────────────┐
│                    External Event Sources                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Webhooks   │  │    Queues    │  │   Polling    │      │
│  │ (GitHub,     │  │ (RabbitMQ,   │  │ (RSS, REST   │      │
│  │  Slack, etc) │  │  Redis, SQS) │  │  APIs)       │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
└─────────┼──────────────────┼──────────────────┼──────────────┘
          │                  │                  │
          ▼                  ▼                  ▼
┌─────────────────────────────────────────────────────────────┐
│              Connector Worker Service                        │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  HTTP Server (Webhook Receiver)                       │  │
│  │  POST /webhooks/:connectorId                          │  │
│  └───────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Queue Consumers (Background Workers)                 │  │
│  │  - RabbitMQ Consumer                                  │  │
│  │  - Redis Pub/Sub Subscriber                           │  │
│  └───────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Polling Workers (Scheduled Jobs)                     │  │
│  │  - HTTP Polling (RSS, REST APIs)                      │  │
│  │  - File System Watcher                                │  │
│  └───────────────────────────────────────────────────────┘  │
│                          │                                   │
│                          ▼                                   │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Event Processor                                      │  │
│  │  1. Validate event signature (webhooks)              │  │
│  │  2. Extract payload                                   │  │
│  │  3. Transform to task input (JSONPath/template)      │  │
│  │  4. Submit task to agent                              │  │
│  │  5. Record event in database                          │  │
│  └───────────────────────────────────────────────────────┘  │
│                          │                                   │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Connector Repository (SQLite)                        │  │
│  │  - connectors table                                   │  │
│  │  - connector_events table                             │  │
│  └───────────────────────────────────────────────────────┘  │
└──────────────────────────┬───────────────────────────────────┘
                           │ HTTP POST
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    Gateway (AgentService)                    │
│  POST /api/v1/tasks                                          │
│  { agentId, input }                                          │
└─────────────────────────────────────────────────────────────┘
```

## Database Schema

### Connectors Table

```sql
CREATE TABLE connectors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL, -- 'webhook', 'queue', 'polling'
  agent_id TEXT NOT NULL,
  config TEXT NOT NULL, -- JSON: connector-specific configuration
  transformation TEXT NOT NULL, -- JSON: event-to-task mapping
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_event_at TEXT,
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
);

CREATE INDEX idx_connectors_type ON connectors(type);
CREATE INDEX idx_connectors_enabled ON connectors(enabled);
```

**Config Schema by Type:**

**Webhook:**
```json
{
  "type": "webhook",
  "secret": "webhook-secret-key",
  "signatureHeader": "X-Hub-Signature-256",
  "signatureAlgorithm": "sha256",
  "allowedIPs": ["192.30.252.0/22"] // optional IP whitelist
}
```

**Queue (RabbitMQ):**
```json
{
  "type": "queue",
  "provider": "rabbitmq",
  "url": "amqp://localhost:5672",
  "queue": "senclaw-events",
  "exchange": "events",
  "routingKey": "agent.*",
  "prefetch": 1
}
```

**Queue (Redis):**
```json
{
  "type": "queue",
  "provider": "redis",
  "url": "redis://localhost:6379",
  "channel": "senclaw:events"
}
```

**Polling (HTTP):**
```json
{
  "type": "polling",
  "provider": "http",
  "url": "https://api.example.com/feed",
  "method": "GET",
  "headers": { "Authorization": "Bearer token" },
  "interval": 300, // seconds
  "changeDetection": "etag" // or "content-hash", "last-modified"
}
```

**Transformation Schema:**
```json
{
  "inputTemplate": "{{body.message}}",
  "jsonPath": "$.data.content",
  "staticPrefix": "New event: ",
  "filters": [
    { "field": "$.action", "operator": "equals", "value": "opened" }
  ]
}
```

### Connector Events Table

```sql
CREATE TABLE connector_events (
  id TEXT PRIMARY KEY,
  connector_id TEXT NOT NULL,
  payload TEXT NOT NULL, -- JSON: raw event payload
  transformed_input TEXT, -- extracted task input
  status TEXT NOT NULL, -- 'pending', 'submitted', 'failed', 'filtered'
  run_id TEXT,
  error TEXT,
  received_at TEXT NOT NULL,
  processed_at TEXT,
  FOREIGN KEY (connector_id) REFERENCES connectors(id) ON DELETE CASCADE,
  FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE SET NULL
);

CREATE INDEX idx_connector_events_connector_id ON connector_events(connector_id);
CREATE INDEX idx_connector_events_status ON connector_events(status);
CREATE INDEX idx_connector_events_received_at ON connector_events(received_at);
```

## Connector Types

### 1. Webhook Connector

**Purpose**: Receive HTTP POST requests from external services (GitHub, Slack, generic webhooks).

**Flow**:
1. External service sends POST to `/webhooks/:connectorId`
2. Validate signature using connector's secret
3. Extract payload from request body
4. Apply transformation to extract task input
5. Submit task to agent
6. Return 202 Accepted immediately (async processing)

**Signature Validation**:
- **GitHub**: `X-Hub-Signature-256` header, HMAC-SHA256
- **Slack**: `X-Slack-Signature` header, HMAC-SHA256 with timestamp
- **Generic**: Configurable header and algorithm

**Example GitHub Webhook Config**:
```json
{
  "type": "webhook",
  "secret": "github-webhook-secret",
  "signatureHeader": "X-Hub-Signature-256",
  "signatureAlgorithm": "sha256"
}
```

**Example Transformation**:
```json
{
  "filters": [
    { "field": "$.action", "operator": "equals", "value": "opened" }
  ],
  "inputTemplate": "New issue: {{body.issue.title}}\n{{body.issue.body}}"
}
```

### 2. Queue Connector

**Purpose**: Consume messages from message queues (RabbitMQ, Redis Pub/Sub, AWS SQS).

**Flow**:
1. Subscribe to queue/channel on connector creation
2. Receive message from queue
3. Apply transformation to extract task input
4. Submit task to agent
5. Acknowledge message (or nack on failure)

**RabbitMQ Consumer**:
```typescript
async function startRabbitMQConsumer(connector: Connector) {
  const connection = await amqp.connect(connector.config.url);
  const channel = await connection.createChannel();

  await channel.assertQueue(connector.config.queue, { durable: true });
  await channel.prefetch(connector.config.prefetch || 1);

  channel.consume(connector.config.queue, async (msg) => {
    if (!msg) return;

    try {
      const payload = JSON.parse(msg.content.toString());
      await processEvent(connector, payload);
      channel.ack(msg);
    } catch (error) {
      logger.error({ error, connectorId: connector.id }, 'Failed to process message');
      channel.nack(msg, false, false); // don't requeue
    }
  });
}
```

**Redis Pub/Sub Subscriber**:
```typescript
async function startRedisSubscriber(connector: Connector) {
  const redis = new Redis(connector.config.url);

  redis.subscribe(connector.config.channel, (err, count) => {
    if (err) {
      logger.error({ error: err }, 'Failed to subscribe to Redis channel');
      return;
    }
    logger.info({ channel: connector.config.channel }, 'Subscribed to Redis channel');
  });

  redis.on('message', async (channel, message) => {
    try {
      const payload = JSON.parse(message);
      await processEvent(connector, payload);
    } catch (error) {
      logger.error({ error, connectorId: connector.id }, 'Failed to process Redis message');
    }
  });
}
```

### 3. Polling Connector

**Purpose**: Periodically check external APIs for new data (RSS feeds, REST endpoints, file changes).

**Flow**:
1. Schedule periodic check (every N seconds)
2. Fetch data from external source
3. Compare with previous state (ETag, content hash, last-modified)
4. If changed, extract new items
5. For each new item, apply transformation and submit task

**HTTP Polling**:
```typescript
async function pollHTTPSource(connector: Connector) {
  const response = await fetch(connector.config.url, {
    method: connector.config.method || 'GET',
    headers: connector.config.headers,
  });

  const etag = response.headers.get('etag');
  const lastModified = response.headers.get('last-modified');

  // Check if content changed
  const previousState = await getConnectorState(connector.id);
  if (previousState.etag === etag || previousState.lastModified === lastModified) {
    return; // No changes
  }

  const data = await response.json();
  const newItems = extractNewItems(data, previousState);

  for (const item of newItems) {
    await processEvent(connector, item);
  }

  // Update state
  await updateConnectorState(connector.id, { etag, lastModified, data });
}
```

**Change Detection Strategies**:
- **ETag**: Compare `ETag` header
- **Last-Modified**: Compare `Last-Modified` header
- **Content Hash**: Hash response body, compare with previous hash
- **Incremental ID**: Track highest ID seen, fetch items with ID > lastId

## Event Transformation

### JSONPath Extraction

Extract specific fields from event payload:

```json
{
  "jsonPath": "$.data.message",
  "fallback": "No message provided"
}
```

Example:
```json
// Input payload
{
  "data": {
    "message": "Hello from webhook",
    "timestamp": "2026-03-10T12:00:00Z"
  }
}

// Extracted input
"Hello from webhook"
```

### Template Rendering

Use Handlebars-style templates:

```json
{
  "inputTemplate": "New {{body.action}} by {{body.user.login}}: {{body.issue.title}}"
}
```

Example:
```json
// Input payload
{
  "action": "opened",
  "user": { "login": "alice" },
  "issue": { "title": "Bug in login" }
}

// Rendered input
"New opened by alice: Bug in login"
```

### Filtering

Apply filters before processing:

```json
{
  "filters": [
    { "field": "$.action", "operator": "equals", "value": "opened" },
    { "field": "$.issue.state", "operator": "not_equals", "value": "closed" }
  ]
}
```

**Supported Operators**:
- `equals`, `not_equals`
- `contains`, `not_contains`
- `starts_with`, `ends_with`
- `greater_than`, `less_than` (for numbers)
- `regex`

### Static Prefix/Suffix

Add static text:

```json
{
  "staticPrefix": "[ALERT] ",
  "jsonPath": "$.message",
  "staticSuffix": " - Please investigate."
}
```

## Event Processing Pipeline

```typescript
async function processEvent(connector: Connector, payload: unknown): Promise<void> {
  const eventId = randomUUID();

  try {
    // 1. Record event
    await eventRepo.create({
      id: eventId,
      connectorId: connector.id,
      payload: JSON.stringify(payload),
      status: 'pending',
      receivedAt: new Date().toISOString(),
    });

    // 2. Apply filters
    if (!passesFilters(payload, connector.transformation.filters)) {
      await eventRepo.updateStatus(eventId, 'filtered');
      return;
    }

    // 3. Transform payload to task input
    const taskInput = transformPayload(payload, connector.transformation);

    await eventRepo.update(eventId, {
      transformedInput: taskInput,
    });

    // 4. Submit task to agent
    const run = await agentService.submitTask(connector.agentId, taskInput);

    // 5. Update event status
    await eventRepo.update(eventId, {
      status: 'submitted',
      runId: run.id,
      processedAt: new Date().toISOString(),
    });

    logger.info({
      connectorId: connector.id,
      eventId,
      runId: run.id,
    }, 'Event processed successfully');

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);

    await eventRepo.update(eventId, {
      status: 'failed',
      error: errorMsg,
      processedAt: new Date().toISOString(),
    });

    logger.error({
      connectorId: connector.id,
      eventId,
      error: errorMsg,
    }, 'Failed to process event');

    // Retry logic (optional)
    if (shouldRetry(error)) {
      await scheduleRetry(connector, payload, eventId);
    }
  }
}
```

## Retry Logic

### Exponential Backoff

```typescript
interface RetryConfig {
  maxRetries: number; // default: 3
  initialDelay: number; // default: 1000ms
  maxDelay: number; // default: 30000ms
  backoffMultiplier: number; // default: 2
}

async function scheduleRetry(
  connector: Connector,
  payload: unknown,
  eventId: string,
  attempt: number = 1
): Promise<void> {
  if (attempt > connector.retryConfig.maxRetries) {
    logger.warn({ connectorId: connector.id, eventId }, 'Max retries exceeded');
    return;
  }

  const delay = Math.min(
    connector.retryConfig.initialDelay * Math.pow(connector.retryConfig.backoffMultiplier, attempt - 1),
    connector.retryConfig.maxDelay
  );

  setTimeout(async () => {
    try {
      await processEvent(connector, payload);
    } catch (error) {
      await scheduleRetry(connector, payload, eventId, attempt + 1);
    }
  }, delay);
}
```

### Retry Conditions

Retry on:
- Network errors (ECONNREFUSED, ETIMEDOUT)
- Gateway 5xx errors
- Rate limiting (429)

Do NOT retry on:
- Validation errors (400)
- Authentication errors (401, 403)
- Not found errors (404)
- Transformation errors

## REST API Endpoints

### Create Connector

```
POST /api/v1/connectors
Content-Type: application/json

{
  "name": "GitHub Issues",
  "type": "webhook",
  "agentId": "agent-123",
  "config": {
    "secret": "webhook-secret",
    "signatureHeader": "X-Hub-Signature-256",
    "signatureAlgorithm": "sha256"
  },
  "transformation": {
    "filters": [
      { "field": "$.action", "operator": "equals", "value": "opened" }
    ],
    "inputTemplate": "New issue: {{body.issue.title}}"
  }
}

Response: 201 Created
{
  "id": "conn-456",
  "name": "GitHub Issues",
  "type": "webhook",
  "webhookUrl": "https://senclaw.example.com/webhooks/conn-456",
  "enabled": true
}
```

### List Connectors

```
GET /api/v1/connectors?type=webhook&enabled=true

Response: 200 OK
[
  {
    "id": "conn-456",
    "name": "GitHub Issues",
    "type": "webhook",
    "agentId": "agent-123",
    "enabled": true,
    "lastEventAt": "2026-03-10T12:00:00Z"
  }
]
```

### Get Connector

```
GET /api/v1/connectors/:id

Response: 200 OK
{
  "id": "conn-456",
  "name": "GitHub Issues",
  "type": "webhook",
  "agentId": "agent-123",
  "config": { ... },
  "transformation": { ... },
  "enabled": true,
  "createdAt": "2026-03-01T00:00:00Z",
  "lastEventAt": "2026-03-10T12:00:00Z"
}
```

### Update Connector

```
PATCH /api/v1/connectors/:id
Content-Type: application/json

{
  "enabled": false,
  "transformation": { ... }
}

Response: 200 OK
```

### Delete Connector

```
DELETE /api/v1/connectors/:id

Response: 204 No Content
```

### List Connector Events

```
GET /api/v1/connectors/:id/events?status=submitted&limit=50

Response: 200 OK
[
  {
    "id": "event-789",
    "connectorId": "conn-456",
    "status": "submitted",
    "runId": "run-101",
    "receivedAt": "2026-03-10T12:00:00Z",
    "processedAt": "2026-03-10T12:00:01Z"
  }
]
```

## Security Considerations

### Webhook Signature Validation

Always validate webhook signatures to prevent:
- Replay attacks
- Spoofed requests
- Unauthorized access

```typescript
function validateWebhookSignature(
  payload: string,
  signature: string,
  secret: string,
  algorithm: string
): boolean {
  const hmac = crypto.createHmac(algorithm, secret);
  hmac.update(payload);
  const expectedSignature = `sha256=${hmac.digest('hex')}`;
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}
```

### IP Whitelisting

Restrict webhook sources by IP:

```typescript
function isAllowedIP(ip: string, allowedRanges: string[]): boolean {
  // Use ipaddr.js or similar library
  return allowedRanges.some(range => ipInRange(ip, range));
}
```

### Rate Limiting

Prevent abuse:
- Per-connector rate limits (e.g., 100 events/min)
- Global rate limits (e.g., 1000 events/min)

### Secret Management

- Store secrets encrypted in database
- Rotate secrets regularly
- Never log secrets

## Performance Optimization

### Async Processing

- Webhook endpoint returns 202 immediately
- Process events in background workers
- Use job queue for retry logic

### Connection Pooling

- Reuse HTTP connections for polling
- Maintain persistent queue connections
- Connection health checks

### Batch Processing

For high-volume connectors:
- Batch multiple events into single task
- Configurable batch size and timeout

## Observability

### Metrics

- `connector_events_received_total{connector_id, type}`
- `connector_events_processed_total{connector_id, status}`
- `connector_processing_duration_seconds{connector_id}`
- `connector_queue_depth{connector_id}` (for queue connectors)

### Logging

Log every event:
- Received: connector ID, event ID, payload size
- Processed: connector ID, event ID, run ID, duration
- Failed: connector ID, event ID, error message

### Health Check

```
GET /health

Response: 200 OK
{
  "status": "healthy",
  "connectors": {
    "total": 10,
    "enabled": 8,
    "webhook": 5,
    "queue": 2,
    "polling": 1
  },
  "events": {
    "pending": 3,
    "processing": 2
  }
}
```

## Testing Strategy

### Unit Tests
- Signature validation
- Payload transformation
- Filter evaluation

### Integration Tests
- Webhook endpoint (send POST, verify task submitted)
- Queue consumer (publish message, verify task submitted)
- Polling worker (mock HTTP response, verify task submitted)

### End-to-End Tests
- GitHub webhook → agent execution
- RabbitMQ message → agent execution
- RSS feed polling → agent execution
