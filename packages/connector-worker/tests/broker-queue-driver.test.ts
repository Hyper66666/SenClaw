import { describe, expect, it, vi } from "vitest";
import type { Connector } from "@senclaw/protocol";
import { BrokerQueueDriver } from "../src/broker-queue-driver.js";

const rabbitConnector = {
  id: "connector-rabbit-dispatch",
  name: "Rabbit Orders",
  type: "queue",
  agentId: "agent-1",
  config: {
    type: "queue",
    provider: "rabbitmq",
    url: "amqp://localhost:5672",
    queue: "orders",
  },
  transformation: {},
  enabled: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
} as unknown as Connector;

const redisConnector = {
  id: "connector-redis-dispatch",
  name: "Redis Orders",
  type: "queue",
  agentId: "agent-1",
  config: {
    type: "queue",
    provider: "redis",
    url: "redis://localhost:6379",
    stream: "senclaw:events",
    consumerGroup: "senclaw-workers",
  },
  transformation: {},
  enabled: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
} as unknown as Connector;

describe("BrokerQueueDriver", () => {
  it("dispatches RabbitMQ connectors to the RabbitMQ driver", async () => {
    const rabbitDriver = {
      subscribe: vi.fn(async () => ({ close: vi.fn(async () => undefined) })),
    };
    const redisDriver = {
      subscribe: vi.fn(async () => ({ close: vi.fn(async () => undefined) })),
    };
    const driver = new BrokerQueueDriver({
      rabbitmq: rabbitDriver as never,
      redis: redisDriver as never,
    });

    await driver.subscribe(rabbitConnector, async () => undefined);

    expect(rabbitDriver.subscribe).toHaveBeenCalledTimes(1);
    expect(redisDriver.subscribe).not.toHaveBeenCalled();
  });

  it("dispatches Redis connectors to the Redis driver", async () => {
    const rabbitDriver = {
      subscribe: vi.fn(async () => ({ close: vi.fn(async () => undefined) })),
    };
    const redisDriver = {
      subscribe: vi.fn(async () => ({ close: vi.fn(async () => undefined) })),
    };
    const driver = new BrokerQueueDriver({
      rabbitmq: rabbitDriver as never,
      redis: redisDriver as never,
    });

    await driver.subscribe(redisConnector, async () => undefined);

    expect(redisDriver.subscribe).toHaveBeenCalledTimes(1);
    expect(rabbitDriver.subscribe).not.toHaveBeenCalled();
  });
});
