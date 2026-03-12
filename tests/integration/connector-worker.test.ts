import { createHmac } from "node:crypto";
import type { QueueDriver, QueueMessage } from "@senclaw/connector-worker";
import type { Connector } from "@senclaw/protocol";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "../../apps/gateway/src/server";

class InMemoryQueueDriver implements QueueDriver {
  private readonly handlers = new Map<
    string,
    (message: QueueMessage) => Promise<void>
  >();

  async subscribe(
    connector: Connector,
    onMessage: (message: QueueMessage) => Promise<void>,
  ) {
    this.handlers.set(connector.id, onMessage);
    return {
      close: async () => {
        this.handlers.delete(connector.id);
      },
    };
  }

  async publish(connectorId: string, payload: unknown) {
    const handler = this.handlers.get(connectorId);
    if (!handler) {
      throw new Error(`No queue subscriber registered for ${connectorId}`);
    }

    let acknowledged = false;
    let rejected = false;
    let requeued = false;

    await handler({
      payload,
      ack: async () => {
        acknowledged = true;
      },
      nack: async (requeue = false) => {
        rejected = true;
        requeued = requeue;
      },
    });

    return { acknowledged, rejected, requeued };
  }
}

describe("Connector worker integration", () => {
  let app: FastifyInstance;
  let adminKey = "";
  let previousDbUrl: string | undefined;
  const queueDriver = new InMemoryQueueDriver();

  const authHeaders = () => ({ authorization: `Bearer ${adminKey}` });

  beforeAll(async () => {
    previousDbUrl = process.env.SENCLAW_DB_URL;
    process.env.SENCLAW_DB_URL = ":memory:";

    const server = await createServer({
      queueDriver,
    });
    app = server.app;
    adminKey = server.bootstrapAdminKey ?? "";
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    if (previousDbUrl === undefined) {
      process.env.SENCLAW_DB_URL = undefined;
    } else {
      process.env.SENCLAW_DB_URL = previousDbUrl;
    }
  });

  it("accepts a webhook and records a submitted connector event with a run", async () => {
    const agentRes = await app.inject({
      method: "POST",
      url: "/api/v1/agents",
      headers: authHeaders(),
      payload: {
        name: "Connector Integration Agent",
        systemPrompt: "Process connector events",
        provider: { provider: "test-provider", model: "test-model" },
        tools: [],
      },
    });
    expect(agentRes.statusCode).toBe(201);
    const agent = agentRes.json();

    const connectorRes = await app.inject({
      method: "POST",
      url: "/api/v1/connectors",
      headers: authHeaders(),
      payload: {
        name: "GitHub Issues",
        type: "webhook",
        agentId: agent.id,
        config: {
          type: "webhook",
          secret: "top-secret",
          signatureHeader: "X-Hub-Signature-256",
          signatureAlgorithm: "sha256",
        },
        transformation: {
          inputTemplate: "Issue: {{body.issue.title}}",
        },
      },
    });
    expect(connectorRes.statusCode).toBe(201);
    const connector = connectorRes.json();

    const payload = JSON.stringify({
      action: "opened",
      issue: { title: "Webhook integration works" },
    });
    const signature = `sha256=${createHmac("sha256", "top-secret")
      .update(payload)
      .digest("hex")}`;

    const webhookRes = await app.inject({
      method: "POST",
      url: `/webhooks/${connector.id}`,
      payload,
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": signature,
      },
    });
    expect(webhookRes.statusCode).toBe(202);

    let events: Array<{ status: string; runId?: string }> = [];
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const eventsRes = await app.inject({
        method: "GET",
        url: `/api/v1/connectors/${connector.id}/events`,
        headers: authHeaders(),
      });
      expect(eventsRes.statusCode).toBe(200);
      events = eventsRes.json();
      if (events.some((event) => event.status === "submitted" && event.runId)) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    expect(events).toHaveLength(1);
    const event = events[0];
    expect(event.status).toBe("submitted");
    expect(event.runId).toBeDefined();

    const runRes = await app.inject({
      method: "GET",
      url: `/api/v1/runs/${event.runId}`,
      headers: authHeaders(),
    });
    expect(runRes.statusCode).toBe(200);
  });

  it("consumes a queue message and records a submitted connector event with a run", async () => {
    const agentRes = await app.inject({
      method: "POST",
      url: "/api/v1/agents",
      headers: authHeaders(),
      payload: {
        name: "Queue Connector Agent",
        systemPrompt: "Process queue events",
        provider: { provider: "test-provider", model: "test-model" },
        tools: [],
      },
    });
    expect(agentRes.statusCode).toBe(201);
    const agent = agentRes.json();

    const connectorRes = await app.inject({
      method: "POST",
      url: "/api/v1/connectors",
      headers: authHeaders(),
      payload: {
        name: "RabbitMQ Orders",
        type: "queue",
        agentId: agent.id,
        config: {
          type: "queue",
          provider: "rabbitmq",
          url: "amqp://queue.test.local",
          queue: "orders",
        },
        transformation: {
          inputTemplate: "Order {{body.id}} for {{body.customer}}",
        },
      },
    });
    expect(connectorRes.statusCode).toBe(201);
    const connector = connectorRes.json();

    const publishResult = await queueDriver.publish(connector.id, {
      id: "order-42",
      customer: "Ada",
    });
    expect(publishResult).toEqual({
      acknowledged: true,
      rejected: false,
      requeued: false,
    });

    let events: Array<{ status: string; runId?: string }> = [];
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const eventsRes = await app.inject({
        method: "GET",
        url: `/api/v1/connectors/${connector.id}/events`,
        headers: authHeaders(),
      });
      expect(eventsRes.statusCode).toBe(200);
      events = eventsRes.json();
      if (events.some((event) => event.status === "submitted" && event.runId)) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    expect(events).toHaveLength(1);
    const event = events[0];
    expect(event.status).toBe("submitted");
    expect(event.runId).toBeDefined();

    const runRes = await app.inject({
      method: "GET",
      url: `/api/v1/runs/${event.runId}`,
      headers: authHeaders(),
    });
    expect(runRes.statusCode).toBe(200);
  });
});
