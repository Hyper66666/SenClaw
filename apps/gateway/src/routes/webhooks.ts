import type { Connector, IConnectorRepository } from "@senclaw/protocol";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

interface WebhookConnector {
  validateWebhook(
    connector: Connector,
    signature?: string,
    rawBody?: string,
  ): void;
  handleWebhook(
    connector: Connector,
    payload: unknown,
    signature?: string,
    rawBody?: string,
  ): Promise<void>;
}

export async function webhookRoutes(
  app: FastifyInstance,
  opts: {
    connectorRepo: IConnectorRepository;
    webhookConnector: WebhookConnector | null;
  },
): Promise<void> {
  const { connectorRepo, webhookConnector } = opts;

  app.post("/:connectorId", async (request, reply) => {
    const ParamsSchema = z.object({
      connectorId: z.string().uuid(),
    });

    const parsed = ParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      reply.status(400).send({
        error: "VALIDATION_ERROR",
        message: "Invalid connector ID",
      });
      return;
    }

    const connector = await connectorRepo.get(parsed.data.connectorId);
    if (!connector) {
      reply.status(404).send({
        error: "NOT_FOUND",
        message: "Connector not found",
      });
      return;
    }

    if (connector.type !== "webhook") {
      reply.status(400).send({
        error: "INVALID_CONNECTOR_TYPE",
        message: "Connector is not a webhook type",
      });
      return;
    }

    if (!connector.enabled) {
      reply.status(403).send({
        error: "CONNECTOR_DISABLED",
        message: "Connector is disabled",
      });
      return;
    }

    if (!webhookConnector) {
      reply.status(503).send({
        error: "CONNECTOR_FEATURES_DISABLED",
        message: "Webhook processing is not available",
      });
      return;
    }

    const config = connector.config as { signatureHeader?: string };
    const signatureHeader = config.signatureHeader || "X-Hub-Signature-256";
    const signature = request.headers[signatureHeader.toLowerCase()] as
      | string
      | undefined;
    const rawBody =
      typeof request.body === "string"
        ? request.body
        : JSON.stringify(request.body);

    try {
      webhookConnector.validateWebhook(connector, signature, rawBody);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      reply.status(401).send({
        error: "INVALID_SIGNATURE",
        message: errorMsg,
      });
      return;
    }

    void webhookConnector
      .handleWebhook(connector, request.body, signature, rawBody)
      .catch((error) => {
        app.log.error(
          {
            error,
            connectorId: connector.id,
          },
          "Webhook processing failed",
        );
      });

    reply.status(202).send({
      message: "Webhook received and queued for processing",
    });
  });
}
