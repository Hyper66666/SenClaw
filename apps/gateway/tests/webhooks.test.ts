import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Connector } from "@senclaw/protocol";
import { webhookRoutes } from "../src/routes/webhooks.js";

function createConnector(): Connector {
  const now = new Date().toISOString();
  return {
    id: "2ff9bb39-ea76-4654-a4e8-5b00a01b9c4c",
    name: "incoming-webhook",
    type: "webhook",
    agentId: "f1a4ea7b-6fd4-4cc9-90c6-8f7f4c3a8f51",
    config: {
      type: "webhook",
      secret: "top-secret",
      signatureHeader: "X-Hub-Signature-256",
    },
    transformation: {},
    enabled: true,
    createdAt: now,
    updatedAt: now,
  };
}

describe("webhookRoutes", () => {
  let app: Awaited<ReturnType<typeof Fastify>>;

  afterEach(async () => {
    await app?.close();
  });

  it("returns 401 when signature validation fails before acknowledging the webhook", async () => {
    const connector = createConnector();
    const validateWebhook = vi.fn(() => {
      throw new Error("Invalid webhook signature");
    });
    const handleWebhook = vi.fn(async () => undefined);

    app = Fastify();
    await app.register(webhookRoutes, {
      prefix: "/webhooks",
      connectorRepo: {
        get: async () => connector,
      } as never,
      webhookConnector: {
        validateWebhook,
        handleWebhook,
      } as never,
    });

    const response = await app.inject({
      method: "POST",
      url: `/webhooks/${connector.id}`,
      payload: { hello: "world" },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error).toBe("INVALID_SIGNATURE");
    expect(handleWebhook).not.toHaveBeenCalled();
  });

  it("returns 202 and dispatches valid webhooks for async processing", async () => {
    const connector = createConnector();
    const validateWebhook = vi.fn(() => undefined);
    const handleWebhook = vi.fn(async () => undefined);

    app = Fastify();
    await app.register(webhookRoutes, {
      prefix: "/webhooks",
      connectorRepo: {
        get: async () => connector,
      } as never,
      webhookConnector: {
        validateWebhook,
        handleWebhook,
      } as never,
    });

    const response = await app.inject({
      method: "POST",
      url: `/webhooks/${connector.id}`,
      payload: { hello: "world" },
      headers: {
        "x-hub-signature-256": "sha256=test",
      },
    });

    expect(response.statusCode).toBe(202);
    expect(validateWebhook).toHaveBeenCalledTimes(1);
    expect(handleWebhook).toHaveBeenCalledTimes(1);
  });
});
