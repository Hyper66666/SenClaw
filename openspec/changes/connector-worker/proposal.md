# Connector Worker

## Problem Statement

Senclaw agents currently only respond to API-triggered tasks. They cannot:
- React to external events (webhooks, message queues, file system changes)
- Integrate with third-party services (Slack, GitHub, email)
- Act as event-driven automation (trigger on new data, alerts, notifications)

## Proposed Solution

Implement a Connector Worker service that:
1. **Listens to external event sources** (webhooks, queues, polling)
2. **Transforms events into agent tasks** using configurable mappings
3. **Submits tasks to agents** via AgentService API
4. **Tracks event processing** for debugging and replay

### Core Capabilities

- **Webhook Receiver**: HTTP endpoint for incoming webhooks (GitHub, Slack, generic)
- **Message Queue Consumer**: Subscribe to queues (RabbitMQ, Redis, AWS SQS)
- **Polling Connectors**: Periodically check external APIs (RSS feeds, REST endpoints)
- **Event Mapping**: Transform event payloads into agent task inputs
- **Retry Logic**: Handle transient failures with exponential backoff
- **Event History**: Store processed events for audit and replay

### Technology Stack

- **HTTP Server**: Fastify (reuse gateway patterns)
- **Queue Client**: `amqplib` for RabbitMQ, `ioredis` for Redis
- **Event Storage**: SQLite via Drizzle ORM
- **Transformation**: JSONPath or simple template engine

## Dependencies

- `persistent-storage` (for event history)
- `AgentService` API (for task submission)

## Timeline: 5-7 days
