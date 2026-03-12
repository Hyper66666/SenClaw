import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { Connector } from "@senclaw/protocol";
import { WebhookConnector } from "../src/webhook-connector.js";

function createConnector(): Connector {
  const now = new Date().toISOString();
  return {
    id: "b3c8eb3d-42dd-4ab8-8b2d-1a8e4ce4b001",
    name: "github-webhook",
    type: "webhook",
    agentId: "7d6f5d70-82a0-4d3d-a930-4d7b9ff0f301",
    config: {
      type: "webhook",
      secret: "top-secret",
      signatureAlgorithm: "sha256",
    },
    transformation: {},
    enabled: true,
    createdAt: now,
    updatedAt: now,
  };
}

describe("WebhookConnector", () => {
  it("rejects requests when a configured signature is missing", async () => {
    const eventProcessor = {
      processEvent: vi.fn(async () => undefined),
    };
    const connector = new WebhookConnector(eventProcessor as never);

    await expect(
      connector.handleWebhook(
        createConnector(),
        { hello: "world" },
        undefined,
        JSON.stringify({ hello: "world" }),
      ),
    ).rejects.toThrow("Missing webhook signature");

    expect(eventProcessor.processEvent).not.toHaveBeenCalled();
  });

  it("accepts requests with a valid signature", async () => {
    const eventProcessor = {
      processEvent: vi.fn(async () => undefined),
    };
    const connector = new WebhookConnector(eventProcessor as never);
    const rawBody = JSON.stringify({ hello: "world" });
    const signature = `sha256=${createHmac("sha256", "top-secret").update(rawBody).digest("hex")}`;

    await expect(
      connector.handleWebhook(
        createConnector(),
        JSON.parse(rawBody),
        signature,
        rawBody,
      ),
    ).resolves.toBeUndefined();

    expect(eventProcessor.processEvent).toHaveBeenCalledTimes(1);
  });
});
