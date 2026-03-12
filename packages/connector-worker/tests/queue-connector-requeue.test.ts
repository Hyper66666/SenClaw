import { describe, expect, it, vi } from "vitest";
import type { Connector } from "@senclaw/protocol";
import { QueueConnector } from "../src/queue-connector.js";

const connector = {
  id: "connector-queue-requeue",
  name: "queue-events",
  type: "queue",
  agentId: "agent-1",
  config: {
    type: "queue",
    provider: "rabbitmq",
    url: "amqp://localhost",
    queue: "events",
    requeueOnFailure: true,
  },
  transformation: {},
  enabled: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
} as unknown as Connector;

describe("QueueConnector requeue behavior", () => {
  it("requeues failed messages when the connector requests it", async () => {
    let handler:
      | ((message: {
          payload: unknown;
          ack(): Promise<void>;
          nack(requeue?: boolean): Promise<void>;
        }) => Promise<void>)
      | undefined;

    const driver = {
      subscribe: vi.fn(async (_connector, onMessage) => {
        handler = onMessage;
        return { close: vi.fn(async () => undefined) };
      }),
    };
    const eventProcessor = {
      processEvent: vi.fn(async () => {
        throw new Error("processing failed");
      }),
    };
    const queueConnector = new QueueConnector(
      eventProcessor as never,
      driver as never,
    );

    await queueConnector.start(connector);

    const ack = vi.fn(async () => undefined);
    const nack = vi.fn(async () => undefined);
    await handler?.({ payload: { hello: "world" }, ack, nack });

    expect(ack).not.toHaveBeenCalled();
    expect(nack).toHaveBeenCalledWith(true);
  });
});
