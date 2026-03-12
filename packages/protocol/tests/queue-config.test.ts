import { describe, expect, it } from "vitest";
import { QueueConfigSchema } from "../src/index.js";

describe("QueueConfigSchema", () => {
  it("accepts a production rabbitmq queue config", () => {
    const result = QueueConfigSchema.safeParse({
      type: "queue",
      provider: "rabbitmq",
      url: "amqp://localhost:5672",
      queue: "orders",
      exchange: "orders.events",
      exchangeType: "topic",
      routingKey: "orders.created",
      prefetch: 4,
      durable: true,
      requeueOnFailure: true,
      deadLetterExchange: "orders.dlx",
      deadLetterRoutingKey: "orders.failed",
    });

    expect(result.success).toBe(true);
  });

  it("rejects a rabbitmq config without a queue", () => {
    const result = QueueConfigSchema.safeParse({
      type: "queue",
      provider: "rabbitmq",
      url: "amqp://localhost:5672",
    });

    expect(result.success).toBe(false);
  });

  it("accepts a redis streams config", () => {
    const result = QueueConfigSchema.safeParse({
      type: "queue",
      provider: "redis",
      url: "redis://localhost:6379",
      stream: "senclaw:events",
      consumerGroup: "senclaw-workers",
      consumerName: "worker-a",
      batchSize: 10,
      blockMs: 1000,
      deadLetterStream: "senclaw:events:dlq",
    });

    expect(result.success).toBe(true);
  });

  it("rejects a redis streams config without a consumer group", () => {
    const result = QueueConfigSchema.safeParse({
      type: "queue",
      provider: "redis",
      url: "redis://localhost:6379",
      stream: "senclaw:events",
    });

    expect(result.success).toBe(false);
  });
});
