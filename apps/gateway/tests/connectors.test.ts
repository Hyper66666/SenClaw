import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { connectorRoutes } from "../src/routes/connectors.js";

describe("connectorRoutes", () => {
  let app: Awaited<ReturnType<typeof Fastify>>;

  afterEach(async () => {
    await app?.close();
  });

  it("rejects connector definitions that fail the protocol schema", async () => {
    const create = vi.fn(async (data) => ({
      id: "29f0f9b4-74d8-46d5-8bd8-5145ad13f001",
      enabled: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...data,
    }));

    app = Fastify();
    await app.register(connectorRoutes, {
      prefix: "/api/v1/connectors",
      connectorRepo: {
        create,
        get: async () => undefined,
        list: async () => [],
        update: async () => undefined,
        delete: async () => false,
        updateLastEventAt: async () => undefined,
      } as never,
      eventRepo: {
        create: async () => ({
          id: "event-1",
          connectorId: "connector-1",
          payload: "{}",
          status: "pending",
          receivedAt: new Date().toISOString(),
        }),
        get: async () => undefined,
        listByConnectorId: async () => [],
        update: async () => undefined,
      } as never,
      eventProcessor: {
        processEvent: async () => undefined,
      },
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/connectors",
      payload: {
        name: "polling-without-url",
        type: "polling",
        agentId: "33c3d4ed-86bc-4fe4-b1e0-7c9ceffed001",
        config: {
          type: "polling",
          provider: "http",
          interval: 30,
        },
        transformation: {},
      },
    });

    expect(response.statusCode).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });
});
