import { describe, expect, it, vi } from "vitest";
import type { Connector } from "@senclaw/protocol";
import { RedisQueueDriver } from "../src/redis-queue-driver.js";

const connector = {
  id: "connector-redis-1",
  name: "Redis Orders",
  type: "queue",
  agentId: "agent-1",
  config: {
    type: "queue",
    provider: "redis",
    url: "redis://localhost:6379",
    stream: "senclaw:events",
    consumerGroup: "senclaw-workers",
    consumerName: "worker-a",
    batchSize: 10,
    blockMs: 25,
    deadLetterStream: "senclaw:events:dlq",
  },
  transformation: {},
  enabled: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
} as unknown as Connector;

describe("RedisQueueDriver", () => {
  it("consumes stream entries and wires ack/delete", async () => {
    const client = {
      ensureConsumerGroup: vi.fn(async () => undefined),
      readGroup: vi
        .fn()
        .mockResolvedValueOnce([
          {
            id: "1710000000000-0",
            values: {
              payload: JSON.stringify({ orderId: 42 }),
            },
          },
        ])
        .mockImplementation(async () => {
          await new Promise((resolve) => setTimeout(resolve, 5));
          return [];
        }),
      ack: vi.fn(async () => undefined),
      delete: vi.fn(async () => undefined),
      publish: vi.fn(async () => "1710000000001-0"),
      close: vi.fn(async () => undefined),
      onClose: vi.fn(),
      offClose: vi.fn(),
    };
    const createClient = vi.fn(async () => client);
    const driver = new RedisQueueDriver({ createClient });

    const subscription = await driver.subscribe(connector, async (message) => {
      expect(message.payload).toEqual({ orderId: 42 });
      await message.ack();
    });

    await vi.waitFor(() => {
      expect(client.ack).toHaveBeenCalledWith(
        "senclaw:events",
        "senclaw-workers",
        "1710000000000-0",
      );
    });
    expect(client.delete).toHaveBeenCalledWith(
      "senclaw:events",
      "1710000000000-0",
    );

    await subscription.close();
  });

  it("dead-letters failed entries when requeue is disabled", async () => {
    const client = {
      ensureConsumerGroup: vi.fn(async () => undefined),
      readGroup: vi
        .fn()
        .mockResolvedValueOnce([
          {
            id: "1710000000000-1",
            values: {
              payload: JSON.stringify({ orderId: 99 }),
            },
          },
        ])
        .mockImplementation(async () => {
          await new Promise((resolve) => setTimeout(resolve, 5));
          return [];
        }),
      ack: vi.fn(async () => undefined),
      delete: vi.fn(async () => undefined),
      publish: vi.fn(async () => "1710000000002-0"),
      close: vi.fn(async () => undefined),
      onClose: vi.fn(),
      offClose: vi.fn(),
    };
    const createClient = vi.fn(async () => client);
    const driver = new RedisQueueDriver({ createClient });

    const subscription = await driver.subscribe(connector, async (message) => {
      await message.nack(false);
    });

    await vi.waitFor(() => {
      expect(client.publish).toHaveBeenCalledWith("senclaw:events:dlq", {
        orderId: 99,
      });
    });
    expect(client.ack).toHaveBeenCalledWith(
      "senclaw:events",
      "senclaw-workers",
      "1710000000000-1",
    );
    expect(client.delete).toHaveBeenCalledWith(
      "senclaw:events",
      "1710000000000-1",
    );

    await subscription.close();
  });

  it("reconnects after the client closes", async () => {
    const closeHandlers: Array<() => void> = [];
    const makeClient = () => ({
      ensureConsumerGroup: vi.fn(async () => undefined),
      readGroup: vi.fn(async () => []),
      ack: vi.fn(async () => undefined),
      delete: vi.fn(async () => undefined),
      publish: vi.fn(async () => "1710000000003-0"),
      close: vi.fn(async () => undefined),
      onClose: vi.fn((handler: () => void) => {
        closeHandlers.push(handler);
      }),
      offClose: vi.fn(),
    });
    const createClient = vi
      .fn()
      .mockResolvedValueOnce(makeClient())
      .mockResolvedValueOnce(makeClient());
    const scheduleReconnect = vi.fn(async (work: () => Promise<void>) => {
      await work();
    });
    const driver = new RedisQueueDriver({ createClient, scheduleReconnect });

    const subscription = await driver.subscribe(
      connector,
      async () => undefined,
    );
    closeHandlers[0]?.();

    await vi.waitFor(() => {
      expect(scheduleReconnect).toHaveBeenCalledTimes(1);
    });
    expect(createClient).toHaveBeenCalledTimes(2);

    await subscription.close();
  });
});
