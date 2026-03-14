import { randomUUID } from "node:crypto";
import type { Connector } from "@senclaw/protocol";
import type { QueueDriver } from "../../../packages/connector-worker/src/queue-connector.js";
import { RabbitMqQueueDriver } from "../../../packages/connector-worker/src/rabbitmq-queue-driver.js";
import { RedisQueueDriver } from "../../../packages/connector-worker/src/redis-queue-driver.js";

interface LiveRabbitMqChannel {
  assertExchange(
    exchange: string,
    type: string,
    options: { durable: boolean },
  ): Promise<unknown>;
  assertQueue(
    queue: string,
    options: { durable: boolean; arguments?: Record<string, string> },
  ): Promise<unknown>;
  bindQueue(
    queue: string,
    exchange: string,
    routingKey: string,
  ): Promise<unknown>;
  sendToQueue(queue: string, content: Buffer): Promise<unknown>;
  get(
    queue: string,
    options: { noAck: boolean },
  ): Promise<{ content: Buffer } | false>;
  ack(message: { content: Buffer }): void;
  deleteQueue(queue: string): Promise<unknown>;
  deleteExchange(exchange: string): Promise<unknown>;
  close(): Promise<void>;
}

interface LiveRabbitMqConnection {
  createChannel(): Promise<LiveRabbitMqChannel>;
  close(): Promise<void>;
}

interface LiveRedisClient {
  xadd(
    stream: string,
    id: string,
    field: string,
    value: string,
  ): Promise<string>;
  xrange(
    stream: string,
    start: string,
    end: string,
    countKeyword: string,
    count: number,
  ): Promise<Array<[string, string[]]>>;
  del(...keys: string[]): Promise<number>;
  quit(): Promise<string>;
}

const quietLogger = {
  error: () => {},
  info: () => {},
  warn: () => {},
};

export interface RabbitMqLiveBrokerConfig {
  url: string;
}

export interface RedisLiveBrokerConfig {
  url: string;
}

export interface LiveBrokerTestConfig {
  rabbitmq?: RabbitMqLiveBrokerConfig;
  redis?: RedisLiveBrokerConfig;
}

export interface LiveBrokerTestResources {
  connector: Connector;
  driver: QueueDriver;
  publish(payload: unknown): Promise<void>;
  readDeadLetterMessage(): Promise<unknown | undefined>;
  waitFor(
    assertion: () => Promise<void> | void,
    timeoutMs?: number,
  ): Promise<void>;
  cleanup(): Promise<void>;
}

export interface LiveBrokerResourceOptions {
  deadLetter?: boolean;
}

export function readLiveBrokerTestConfig(
  env: NodeJS.ProcessEnv = process.env,
): LiveBrokerTestConfig {
  const rabbitmqUrl = env.SENCLAW_TEST_RABBITMQ_URL?.trim();
  const redisUrl = env.SENCLAW_TEST_REDIS_URL?.trim();

  return {
    rabbitmq: rabbitmqUrl ? { url: rabbitmqUrl } : undefined,
    redis: redisUrl ? { url: redisUrl } : undefined,
  };
}

async function waitFor(
  assertion: () => Promise<void> | void,
  timeoutMs = 10_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      await assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Timed out waiting for live broker assertion");
}

export async function createRabbitMqResources(
  config: RabbitMqLiveBrokerConfig,
  options: LiveBrokerResourceOptions = {},
): Promise<LiveBrokerTestResources> {
  const rabbitMqModule = (await import("amqplib")) as {
    connect(url: string): Promise<LiveRabbitMqConnection>;
  };
  const connection = await rabbitMqModule.connect(config.url);
  const channel = await connection.createChannel();

  const suffix = randomUUID();
  const queue = `senclaw.live.rabbit.${suffix}`;
  const deadLetterExchange = `senclaw.live.rabbit.dlx.${suffix}`;
  const deadLetterQueue = `senclaw.live.rabbit.dlq.${suffix}`;
  const deadLetterRoutingKey = deadLetterQueue;

  if (options.deadLetter) {
    await channel.assertExchange(deadLetterExchange, "direct", {
      durable: false,
    });
    await channel.assertQueue(deadLetterQueue, { durable: false });
    await channel.bindQueue(
      deadLetterQueue,
      deadLetterExchange,
      deadLetterRoutingKey,
    );
  }

  const connector: Connector = {
    id: randomUUID(),
    name: `RabbitMQ Live ${suffix}`,
    type: "queue",
    agentId: randomUUID(),
    config: {
      type: "queue",
      provider: "rabbitmq",
      url: config.url,
      queue,
      durable: false,
      requeueOnFailure: false,
      ...(options.deadLetter
        ? {
            deadLetterExchange,
            deadLetterRoutingKey,
          }
        : {}),
    },
    transformation: {},
    enabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  return {
    connector,
    driver: new RabbitMqQueueDriver({ logger: quietLogger }),
    async publish(payload: unknown) {
      await channel.sendToQueue(queue, Buffer.from(JSON.stringify(payload)));
    },
    async readDeadLetterMessage() {
      if (!options.deadLetter) {
        return undefined;
      }

      const message = await channel.get(deadLetterQueue, { noAck: false });
      if (!message) {
        return undefined;
      }

      channel.ack(message);
      return JSON.parse(message.content.toString("utf8"));
    },
    waitFor,
    async cleanup() {
      if (options.deadLetter) {
        await channel.deleteQueue(deadLetterQueue).catch(() => undefined);
        await channel.deleteExchange(deadLetterExchange).catch(() => undefined);
      }
      await channel.deleteQueue(queue).catch(() => undefined);
      await channel.close().catch(() => undefined);
      await connection.close().catch(() => undefined);
    },
  };
}

export async function createRedisResources(
  config: RedisLiveBrokerConfig,
  options: LiveBrokerResourceOptions = {},
): Promise<LiveBrokerTestResources> {
  const redisModule = (await import("ioredis")) as {
    default?: new (url: string) => LiveRedisClient;
    Redis?: new (url: string) => LiveRedisClient;
  };
  const Redis = redisModule.default ?? redisModule.Redis;
  if (!Redis) {
    throw new Error("The 'ioredis' package is required for Redis live tests");
  }

  const client = new Redis(config.url);
  const suffix = randomUUID();
  const stream = `senclaw:live:stream:${suffix}`;
  const consumerGroup = `senclaw-live-group-${suffix}`;
  const consumerName = `senclaw-live-consumer-${suffix}`;
  const deadLetterStream = `senclaw:live:dlq:${suffix}`;

  const connector: Connector = {
    id: randomUUID(),
    name: `Redis Live ${suffix}`,
    type: "queue",
    agentId: randomUUID(),
    config: {
      type: "queue",
      provider: "redis",
      url: config.url,
      stream,
      consumerGroup,
      consumerName,
      batchSize: 1,
      blockMs: 100,
      requeueOnFailure: false,
      ...(options.deadLetter
        ? {
            deadLetterStream,
          }
        : {}),
    },
    transformation: {},
    enabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  return {
    connector,
    driver: new RedisQueueDriver({ logger: quietLogger }),
    async publish(payload: unknown) {
      await client.xadd(stream, "*", "payload", JSON.stringify(payload));
    },
    async readDeadLetterMessage() {
      if (!options.deadLetter) {
        return undefined;
      }

      const entries = (await client.xrange(
        deadLetterStream,
        "-",
        "+",
        "COUNT",
        1,
      )) as Array<[string, string[]]>;
      const first = entries[0];
      if (!first) {
        return undefined;
      }

      const [, values] = first;
      const payloadIndex = values.indexOf("payload");
      if (payloadIndex === -1 || payloadIndex === values.length - 1) {
        return undefined;
      }

      return JSON.parse(values[payloadIndex + 1]);
    },
    waitFor,
    async cleanup() {
      await client.del(stream).catch(() => undefined);
      if (options.deadLetter) {
        await client.del(deadLetterStream).catch(() => undefined);
      }
      await client.quit().catch(() => undefined);
    },
  };
}
