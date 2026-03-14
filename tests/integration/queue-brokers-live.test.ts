import type { Connector } from "@senclaw/protocol";
import { afterEach, describe, expect, it } from "vitest";
import { QueueConnector } from "../../packages/connector-worker/src/queue-connector.js";
import {
  type LiveBrokerTestResources,
  createRabbitMqResources,
  createRedisResources,
  readLiveBrokerTestConfig,
} from "./support/live-broker-support.js";

const config = readLiveBrokerTestConfig();

const describeRabbitMq = config.rabbitmq ? describe : describe.skip;
const describeRedis = config.redis ? describe : describe.skip;

function getRabbitMqConfig() {
  if (!config.rabbitmq) {
    throw new Error(
      "SENCLAW_TEST_RABBITMQ_URL is required for RabbitMQ live tests",
    );
  }

  return config.rabbitmq;
}

function getRedisConfig() {
  if (!config.redis) {
    throw new Error("SENCLAW_TEST_REDIS_URL is required for Redis live tests");
  }

  return config.redis;
}

describeRabbitMq("RabbitMQ live broker integration", () => {
  let resources: LiveBrokerTestResources | undefined;
  let queueConnector: QueueConnector | undefined;

  afterEach(async () => {
    await queueConnector?.stop();
    await resources?.cleanup();
    queueConnector = undefined;
    resources = undefined;
  });

  it("subscribes to a real queue and processes a published message", async () => {
    resources = await createRabbitMqResources(getRabbitMqConfig());

    const payloads: unknown[] = [];
    const connector = resources.connector;
    queueConnector = new QueueConnector(
      {
        processEvent: async (_activeConnector: Connector, payload: unknown) => {
          payloads.push(payload);
        },
      },
      resources.driver,
    );

    await queueConnector.start(connector);
    await resources.publish({ orderId: "rabbit-success-1" });

    await resources.waitFor(async () => {
      expect(payloads).toEqual([{ orderId: "rabbit-success-1" }]);
    });
  });

  it("routes failed messages to the configured dead-letter queue", async () => {
    resources = await createRabbitMqResources(getRabbitMqConfig(), {
      deadLetter: true,
    });

    queueConnector = new QueueConnector(
      {
        processEvent: async () => {
          throw new Error("intentional-failure");
        },
      },
      resources.driver,
    );

    await queueConnector.start(resources.connector);
    await resources.publish({ orderId: "rabbit-dlq-1" });

    await resources.waitFor(async () => {
      const activeResources = resources;
      if (!activeResources) {
        throw new Error("RabbitMQ live resources were not initialized");
      }

      expect(await activeResources.readDeadLetterMessage()).toEqual({
        orderId: "rabbit-dlq-1",
      });
    });
  });
});

describeRedis("Redis live broker integration", () => {
  let resources: LiveBrokerTestResources | undefined;
  let queueConnector: QueueConnector | undefined;

  afterEach(async () => {
    await queueConnector?.stop();
    await resources?.cleanup();
    queueConnector = undefined;
    resources = undefined;
  });

  it("subscribes to a real stream and processes a published entry", async () => {
    resources = await createRedisResources(getRedisConfig());

    const payloads: unknown[] = [];
    queueConnector = new QueueConnector(
      {
        processEvent: async (_activeConnector: Connector, payload: unknown) => {
          payloads.push(payload);
        },
      },
      resources.driver,
    );

    await queueConnector.start(resources.connector);
    await resources.publish({ orderId: "redis-success-1" });

    await resources.waitFor(async () => {
      expect(payloads).toEqual([{ orderId: "redis-success-1" }]);
    });
  });

  it("routes failed entries to the configured dead-letter stream", async () => {
    resources = await createRedisResources(getRedisConfig(), {
      deadLetter: true,
    });

    queueConnector = new QueueConnector(
      {
        processEvent: async () => {
          throw new Error("intentional-failure");
        },
      },
      resources.driver,
    );

    await queueConnector.start(resources.connector);
    await resources.publish({ orderId: "redis-dlq-1" });

    await resources.waitFor(async () => {
      const activeResources = resources;
      if (!activeResources) {
        throw new Error("Redis live resources were not initialized");
      }

      expect(await activeResources.readDeadLetterMessage()).toEqual({
        orderId: "redis-dlq-1",
      });
    });
  });
});
