import crypto from "node:crypto";
import type { Connector, WebhookConfig } from "@senclaw/protocol";
import type { EventProcessor } from "./event-processor.js";

export class WebhookConnector {
  constructor(private readonly eventProcessor: EventProcessor) {}

  validateWebhook(
    connector: Connector,
    signature?: string,
    rawBody?: string,
  ): void {
    const config = connector.config as WebhookConfig;
    if (!config.secret) {
      return;
    }

    if (!signature || !rawBody) {
      throw new Error("Missing webhook signature");
    }

    const isValid = this.validateSignature(
      rawBody,
      signature,
      config.secret,
      config.signatureAlgorithm || "sha256",
    );

    if (!isValid) {
      throw new Error("Invalid webhook signature");
    }
  }

  async handleWebhook(
    connector: Connector,
    payload: unknown,
    signature?: string,
    rawBody?: string,
  ): Promise<void> {
    this.validateWebhook(connector, signature, rawBody);
    await this.eventProcessor.processEvent(connector, payload);
  }

  private validateSignature(
    payload: string,
    signature: string,
    secret: string,
    algorithm: string,
  ): boolean {
    try {
      const hmac = crypto.createHmac(algorithm, secret);
      hmac.update(payload);
      const expectedSignature = `${algorithm}=${hmac.digest("hex")}`;

      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature),
      );
    } catch {
      return false;
    }
  }
}
