import { describe, expect, it, vi } from "vitest";
import type { Connector } from "@senclaw/protocol";
import { RabbitMqQueueDriver } from "../src/rabbitmq-queue-driver.js";

const connector = {
  id: "connector-rabbit-1",
  name: "Rabbit Orders",
  type: "queue",
  agentId: "agent-1",
  config: {
    type: "queue",
    provider: "rabbitmq",
    url: "amqp://localhost:5672",
    queue: "orders",
    exchange: "orders.events",
    exchangeType: "topic",
    routingKey: "orders.created",
    prefetch: 4,
    durable: true,
    deadLetterExchange: "orders.dlx",
    deadLetterRoutingKey: "orders.failed",
  },
  transformation: {},
  enabled: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
} as unknown as Connector;

describe("RabbitMqQueueDriver", () => {
  it("subscribes, parses payloads, and wires ack/nack to the channel", async () => {
    let consumer:
      | ((message: { content: Buffer } | null) => Promise<void>)
      | undefined;

    const channel = {
      assertExchange: vi.fn(async () => undefined),
      assertQueue: vi.fn(async () => undefined),
      bindQueue: vi.fn(async () => undefined),
      prefetch: vi.fn(async () => undefined),
      consume: vi.fn(async (_queue, onMessage) => {
        consumer = onMessage;
        return { consumerTag: "consumer-1" };
      }),
      ack: vi.fn(),
      nack: vi.fn(),
      close: vi.fn(async () => undefined),
    };
    const connection = {
      createChannel: vi.fn(async () => channel),
      on: vi.fn(),
      close: vi.fn(async () => undefined),
      removeListener: vi.fn(),
    };
    const connect = vi.fn(async () => connection);
    const driver = new RabbitMqQueueDriver({ connect });

    await driver.subscribe(connector, async (message) => {
      expect(message.payload).toEqual({ orderId: 42 });
      await message.ack();
    });

    await consumer?.({
      content: Buffer.from(JSON.stringify({ orderId: 42 })),
    });

    expect(connect).toHaveBeenCalledWith("amqp://localhost:5672");
    expect(channel.assertExchange).toHaveBeenCalledWith(
      "orders.events",
      "topic",
      { durable: true },
    );
    expect(channel.assertQueue).toHaveBeenCalledWith("orders", {
      durable: true,
      arguments: {
        "x-dead-letter-exchange": "orders.dlx",
        "x-dead-letter-routing-key": "orders.failed",
      },
    });
    expect(channel.bindQueue).toHaveBeenCalledWith(
      "orders",
      "orders.events",
      "orders.created",
    );
    expect(channel.prefetch).toHaveBeenCalledWith(4);
    expect(channel.ack).toHaveBeenCalledTimes(1);
  });

  it("reconnects after the broker connection closes", async () => {
    const closeHandlers: Array<() => void> = [];
    const makeConnection = () => ({
      createChannel: vi.fn(async () => ({
        assertExchange: vi.fn(async () => undefined),
        assertQueue: vi.fn(async () => undefined),
        bindQueue: vi.fn(async () => undefined),
        prefetch: vi.fn(async () => undefined),
        consume: vi.fn(async () => ({ consumerTag: "consumer-1" })),
        ack: vi.fn(),
        nack: vi.fn(),
        close: vi.fn(async () => undefined),
      })),
      on: vi.fn((event, handler) => {
        if (event === "close") {
          closeHandlers.push(handler);
        }
      }),
      close: vi.fn(async () => undefined),
      removeListener: vi.fn(),
    });
    const connect = vi
      .fn()
      .mockResolvedValueOnce(makeConnection())
      .mockResolvedValueOnce(makeConnection());
    const scheduleReconnect = vi.fn(async (work: () => Promise<void>) => {
      await work();
    });
    const driver = new RabbitMqQueueDriver({ connect, scheduleReconnect });

    await driver.subscribe(connector, async () => undefined);
    closeHandlers[0]?.();
    await Promise.resolve();

    expect(scheduleReconnect).toHaveBeenCalledTimes(1);
    expect(connect).toHaveBeenCalledTimes(2);
  });
});
