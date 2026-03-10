# Queue Connector Specification

## Overview

Queue connectors consume messages from message queues (RabbitMQ, Redis Pub/Sub, AWS SQS) and transform them into agent tasks.

## Supported Queue Providers

### 1. RabbitMQ

**Configuration**:
```json
{
  "type": "queue",
  "provider": "rabbitmq",
  "url": "amqp://user:pass@localhost:5672",
  "queue": "senclaw-events",
  "exchange": "events",
  "exchangeType": "topic",
  "routingKey": "agent.*",
  "prefetch": 1,
  "durable": true,
  "autoAck": false
}
```

**Consumer Implementation**:
```typescript
import amqp from 'amqplib';

async function startRabbitMQConsumer(connector: Connector) {
  const connection = await amqp.connect(connector.config.url);
  const channel = await connection.createChannel();

  // Assert exchange
  await channel.assertExchange(
    connector.config.exchange,
    connector.config.exchangeType || 'topic',
    { durable: connector.config.durable ?? true }
  );

  // Assert queue
  await channel.assertQueue(connector.config.queue, {
    durable: connector.config.durable ?? true,
  });

  // Bind queue to exchange
  await channel.bindQueue(
    connector.config.queue,
    connector.config.exchange,
    connector.config.routingKey || '#'
  );

  // Set prefetch
  await channel.prefetch(connector.config.prefetch || 1);

  // Consume messages
  channel.consume(
    connector.config.queue,
    async (msg) => {
      if (!msg) return;

      try {
        const payload = JSON.parse(msg.content.toString());
        await processEvent(connector, payload);
        channel.ack(msg); // Acknowledge success
      } catch (error) {
        logger.error({ error, connectorId: connector.id }, 'Failed to process message');
        channel.nack(msg, false, false); // Don't requeue
      }
    },
    { noAck: connector.config.autoAck ?? false }
  );

  logger.info({ connectorId: connector.id, queue: connector.config.queue }, 'RabbitMQ consumer started');
}
```

### 2. Redis Pub/Sub

**Configuration**:
```json
{
  "type": "queue",
  "provider": "redis",
  "url": "redis://localhost:6379",
  "channel": "senclaw:events",
  "pattern": false
}
```

**Subscriber Implementation**:
```typescript
import Redis from 'ioredis';

async function startRedisSubscriber(connector: Connector) {
  const redis = new Redis(connector.config.url);

  const subscribeMethod = connector.config.pattern ? 'psubscribe' : 'subscribe';
  redis[subscribeMethod](connector.config.channel);

  redis.on('message', async (channel, message) => {
    try {
      const payload = JSON.parse(message);
      await processEvent(connector, payload);
    } catch (error) {
      logger.error({ error, connectorId: connector.id }, 'Failed to process Redis message');
    }
  });

  redis.on('pmessage', async (pattern, channel, message) => {
    try {
      const payload = JSON.parse(message);
      await processEvent(connector, payload);
    } catch (error) {
      logger.error({ error, connectorId: connector.id }, 'Failed to process Redis message');
    }
  });

  logger.info({ connectorId: connector.id, channel: connector.config.channel }, 'Redis subscriber started');
}
```

### 3. AWS SQS

**Configuration**:
```json
{
  "type": "queue",
  "provider": "sqs",
  "queueUrl": "https://sqs.us-east-1.amazonaws.com/123456789/my-queue",
  "region": "us-east-1",
  "maxMessages": 10,
  "waitTimeSeconds": 20,
  "visibilityTimeout": 30
}
```

**Consumer Implementation**:
```typescript
import { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } from '@aws-sdk/client-sqs';

async function startSQSConsumer(connector: Connector) {
  const client = new SQSClient({ region: connector.config.region });

  async function poll() {
    try {
      const command = new ReceiveMessageCommand({
        QueueUrl: connector.config.queueUrl,
        MaxNumberOfMessages: connector.config.maxMessages || 10,
        WaitTimeSeconds: connector.config.waitTimeSeconds || 20,
        VisibilityTimeout: connector.config.visibilityTimeout || 30,
      });

      const response = await client.send(command);

      if (response.Messages) {
        for (const message of response.Messages) {
          try {
            const payload = JSON.parse(message.Body!);
            await processEvent(connector, payload);

            // Delete message after successful processing
            await client.send(new DeleteMessageCommand({
              QueueUrl: connector.config.queueUrl,
              ReceiptHandle: message.ReceiptHandle!,
            }));
          } catch (error) {
            logger.error({ error, messageId: message.MessageId }, 'Failed to process SQS message');
            // Message will become visible again after visibility timeout
          }
        }
      }
    } catch (error) {
      logger.error({ error, connectorId: connector.id }, 'SQS polling error');
    }

    // Continue polling
    setImmediate(poll);
  }

  poll();
  logger.info({ connectorId: connector.id, queueUrl: connector.config.queueUrl }, 'SQS consumer started');
}
```

## Message Acknowledgment

### RabbitMQ

- **Manual Ack**: `channel.ack(msg)` after successful processing
- **Nack**: `channel.nack(msg, false, false)` on failure (don't requeue)
- **Requeue**: `channel.nack(msg, false, true)` for transient errors

### Redis Pub/Sub

- No acknowledgment (fire-and-forget)
- Messages lost if consumer crashes
- Use Redis Streams for at-least-once delivery

### AWS SQS

- **Delete**: Remove message after successful processing
- **Visibility Timeout**: Message becomes visible again if not deleted
- **Dead Letter Queue**: Configure for failed messages

## Error Handling

### Transient Errors

Retry with exponential backoff:
- Network errors
- Gateway 5xx errors
- Rate limiting (429)

### Permanent Errors

Do not retry:
- Validation errors (400)
- Authentication errors (401, 403)
- Transformation errors

### Dead Letter Queue

For RabbitMQ, configure DLQ:
```typescript
await channel.assertQueue('senclaw-events-dlq', { durable: true });
await channel.assertQueue('senclaw-events', {
  durable: true,
  arguments: {
    'x-dead-letter-exchange': '',
    'x-dead-letter-routing-key': 'senclaw-events-dlq',
  },
});
```

## Testing

### RabbitMQ Integration Test

```typescript
describe('RabbitMQ Connector', () => {
  it('consumes message and submits task', async () => {
    const connector = await createTestConnector({
      type: 'queue',
      provider: 'rabbitmq',
      config: {
        url: 'amqp://localhost',
        queue: 'test-queue',
      },
    });

    // Publish message
    const connection = await amqp.connect('amqp://localhost');
    const channel = await connection.createChannel();
    await channel.assertQueue('test-queue');
    channel.sendToQueue('test-queue', Buffer.from(JSON.stringify({ message: 'test' })));

    // Wait for processing
    await waitFor(() => {
      const events = eventRepo.listByConnectorId(connector.id);
      return events.length > 0 && events[0].status === 'submitted';
    });

    const events = await eventRepo.listByConnectorId(connector.id);
    expect(events).toHaveLength(1);
    expect(events[0].status).toBe('submitted');
  });
});
```

## Configuration Examples

### RabbitMQ Topic Exchange

```json
{
  "name": "Event Bus",
  "type": "queue",
  "provider": "rabbitmq",
  "agentId": "agent-123",
  "config": {
    "url": "amqp://user:pass@rabbitmq.example.com:5672",
    "exchange": "events",
    "exchangeType": "topic",
    "queue": "senclaw-agent-events",
    "routingKey": "user.created",
    "prefetch": 5,
    "durable": true
  },
  "transformation": {
    "jsonPath": "$.data.email",
    "inputTemplate": "New user registered: {{body.data.email}}"
  }
}
```

### Redis Pub/Sub Pattern

```json
{
  "name": "Redis Events",
  "type": "queue",
  "provider": "redis",
  "agentId": "agent-456",
  "config": {
    "url": "redis://localhost:6379",
    "channel": "events:*",
    "pattern": true
  },
  "transformation": {
    "jsonPath": "$.message"
  }
}
```

### AWS SQS

```json
{
  "name": "SQS Queue",
  "type": "queue",
  "provider": "sqs",
  "agentId": "agent-789",
  "config": {
    "queueUrl": "https://sqs.us-east-1.amazonaws.com/123456789/my-queue",
    "region": "us-east-1",
    "maxMessages": 10,
    "waitTimeSeconds": 20
  },
  "transformation": {
    "jsonPath": "$.body"
  }
}
```
