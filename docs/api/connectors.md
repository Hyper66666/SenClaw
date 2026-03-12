# Connector Worker

The connector worker bridges external events into Senclaw tasks.

## Current Status

Implemented and locally verified today:

- webhook ingestion
- polling-based connectors with change detection
- queue connector lifecycle hooks through the `QueueDriver` abstraction
- gateway lifecycle wiring for enabled connectors

Not yet bundled as release-ready broker support:

- RabbitMQ driver
- Redis driver
- broker-specific reconnect, dead-letter, and production retry semantics

That means queue connectors are currently a host-integrator feature, not a finished out-of-the-box RabbitMQ/Redis product.

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

Queue connectors consume messages through a runtime-provided `QueueDriver` implementation.

Planned production targets:

- RabbitMQ
- Redis

Example target configuration shape for a future RabbitMQ driver:

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
    "prefetch": 1
  }
}
```

Example target configuration shape for a future Redis driver:

```json
{
  "name": "Redis Notifications",
  "type": "queue",
  "agentId": "<agent-id>",
  "config": {
    "type": "queue",
    "provider": "redis",
    "url": "redis://localhost:6379",
    "channel": "senclaw:events"
  }
}
```

Until those drivers land, queue support depends on the embedding runtime providing a compatible driver implementation.

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
