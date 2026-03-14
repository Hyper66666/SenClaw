# Connector Worker

The connector worker bridges external events into Senclaw tasks.

## Current Status

Implemented and locally verified today:

- webhook ingestion
- polling-based connectors with change detection
- concrete RabbitMQ and Redis Streams queue drivers
- default gateway queue-driver dispatch through `BrokerQueueDriver`
- unit coverage for queue config validation, recovery, and ack/nack behavior

Not yet release-closed:

- live-broker validation against a real RabbitMQ instance
- live-broker validation against a real Redis instance
- evidence-backed release claims for broker-backed queue support

That means broker-backed queues are implemented in the repository, but Senclaw should only claim them as release-ready after real broker validation is recorded.

## Connector Types

### Webhook

Use webhook connectors when an external system can POST events directly to Senclaw.

Example GitHub-style connector:

```json
{
  "name": "GitHub Issues",
  "type": "webhook",
  "agentId": "<agent-id>",
  "config": {
    "type": "webhook",
    "secret": "github-webhook-secret",
    "signatureHeader": "X-Hub-Signature-256",
    "signatureAlgorithm": "sha256"
  },
  "transformation": {
    "filters": [
      { "field": "$.action", "operator": "equals", "value": "opened" }
    ],
    "inputTemplate": "New issue: {{body.issue.title}}\n{{body.issue.body}}"
  }
}
```

### Queue

Queue connectors now use the built-in `BrokerQueueDriver`, which dispatches to RabbitMQ or Redis based on `config.provider`. Embedding runtimes can still override `queueDriver` in `createServer()` when custom behavior is required.

Supported queue modes in the current implementation:

- RabbitMQ queues via `amqplib`
- Redis Streams consumer groups via `ioredis`

RabbitMQ configuration shape:

```json
{
  "name": "RabbitMQ Alerts",
  "type": "queue",
  "agentId": "<agent-id>",
  "config": {
    "type": "queue",
    "provider": "rabbitmq",
    "url": "amqp://localhost:5672",
    "queue": "senclaw-alerts",
    "exchange": "senclaw.events",
    "exchangeType": "topic",
    "routingKey": "alerts.created",
    "prefetch": 1,
    "durable": true,
    "requeueOnFailure": true,
    "deadLetterExchange": "senclaw.dlx",
    "deadLetterRoutingKey": "alerts.failed"
  }
}
```

Redis Streams configuration shape:

```json
{
  "name": "Redis Notifications",
  "type": "queue",
  "agentId": "<agent-id>",
  "config": {
    "type": "queue",
    "provider": "redis",
    "url": "redis://localhost:6379",
    "stream": "senclaw:events",
    "consumerGroup": "senclaw-workers",
    "consumerName": "worker-a",
    "batchSize": 10,
    "blockMs": 1000,
    "requeueOnFailure": false,
    "deadLetterStream": "senclaw:events:dlq"
  }
}
```

Current queue-driver behavior:

- successful processing acknowledges and removes the consumed message
- failed processing can requeue or dead-letter based on connector config
- transient disconnects trigger subscription recovery with structured logs
- startup wiring loads enabled queue connectors automatically in the gateway runtime

Current validation boundary:

- unit tests cover schema validation, driver dispatch, recovery, and ack/nack behavior
- opt-in live broker integration tests now exist in `tests/integration/queue-brokers-live.test.ts`
- configure `SENCLAW_TEST_RABBITMQ_URL` and/or `SENCLAW_TEST_REDIS_URL`, then run `corepack pnpm exec vitest run --config vitest.integration.config.ts tests/integration/queue-brokers-live.test.ts`
- when those env vars are absent, the live-broker suite skips cleanly without failing the normal integration matrix
- release-ready RabbitMQ and Redis claims still require recorded evidence from a real broker run

### Polling

Polling connectors periodically fetch an HTTP resource and only process changed responses.

Example:

```json
{
  "name": "RSS Feed Watcher",
  "type": "polling",
  "agentId": "<agent-id>",
  "config": {
    "type": "polling",
    "provider": "http",
    "url": "https://example.com/feed.json",
    "interval": 300,
    "changeDetection": "etag"
  },
  "transformation": {
    "inputTemplate": "Feed update: {{body.title}}"
  }
}
```

## Transformation Rules

The worker currently supports:

- `jsonPath`
- `inputTemplate`
- `staticPrefix`
- `staticSuffix`
- pre-transform filters

## Webhook Verification

Webhook endpoints are exposed at `/webhooks/:connectorId`.

- requests do not need a Senclaw API key
- requests must pass the configured signature check when a secret is present
- valid requests return `202 Accepted` after validation and then continue processing asynchronously

## Retry Behavior

The event processor retries transient task-submission failures with exponential backoff.

- default retries: `3`
- default initial delay: `1000ms`
- backoff multiplier: `2`
- max delay: `30000ms`

Retryable failures include network errors, `429`, and `5xx` responses. Validation and other `4xx` failures are not retried.
