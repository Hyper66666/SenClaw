import {
  type Connector,
  CreateConnectorSchema,
  type IConnectorEventRepository,
  type IConnectorRepository,
  UpdateConnectorSchema,
} from "@senclaw/protocol";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

interface EventProcessor {
  processEvent(connector: Connector, payload: unknown): Promise<void>;
}

export interface ConnectorLifecycle {
  sync(connector: Connector): Promise<void>;
  stop(connectorId: string): Promise<void>;
}

export async function connectorRoutes(
  app: FastifyInstance,
  opts: {
    connectorRepo: IConnectorRepository;
    eventRepo: IConnectorEventRepository;
    eventProcessor: EventProcessor;
    connectorLifecycle?: ConnectorLifecycle;
  },
): Promise<void> {
  const { connectorRepo, eventRepo, connectorLifecycle } = opts;

  app.post("/", async (request, reply) => {
    const parsed = CreateConnectorSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.status(400).send({
        error: "VALIDATION_ERROR",
        message: "Invalid connector definition",
        details: parsed.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      });
      return;
    }

    const connector = await connectorRepo.create(parsed.data);
    await connectorLifecycle?.sync(connector);
    const response =
      connector.type === "webhook"
        ? {
            ...connector,
            webhookUrl: `${request.protocol}://${request.hostname}/webhooks/${connector.id}`,
          }
        : connector;

    reply.status(201).send(response);
  });

  app.get("/", async (request, reply) => {
    const QuerySchema = z.object({
      type: z.enum(["webhook", "queue", "polling"]).optional(),
      enabled: z
        .string()
        .transform((v) => v === "true")
        .optional(),
      agentId: z.string().uuid().optional(),
    });

    const parsed = QuerySchema.safeParse(request.query);
    if (!parsed.success) {
      reply.status(400).send({
        error: "VALIDATION_ERROR",
        message: "Invalid query parameters",
      });
      return;
    }

    const connectors = await connectorRepo.list(parsed.data);
    reply.send(connectors);
  });

  app.get("/:id", async (request, reply) => {
    const ParamsSchema = z.object({
      id: z.string().uuid(),
    });

    const parsed = ParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      reply.status(400).send({
        error: "VALIDATION_ERROR",
        message: "Invalid connector ID",
      });
      return;
    }

    const connector = await connectorRepo.get(parsed.data.id);
    if (!connector) {
      reply.status(404).send({
        error: "NOT_FOUND",
        message: "Connector not found",
      });
      return;
    }

    reply.send(connector);
  });

  app.patch("/:id", async (request, reply) => {
    const ParamsSchema = z.object({
      id: z.string().uuid(),
    });

    const paramsResult = ParamsSchema.safeParse(request.params);
    const bodyResult = UpdateConnectorSchema.safeParse(request.body);

    if (!paramsResult.success || !bodyResult.success) {
      reply.status(400).send({
        error: "VALIDATION_ERROR",
        message: "Invalid request",
      });
      return;
    }

    const connector = await connectorRepo.update(
      paramsResult.data.id,
      bodyResult.data,
    );

    if (!connector) {
      reply.status(404).send({
        error: "NOT_FOUND",
        message: "Connector not found",
      });
      return;
    }

    await connectorLifecycle?.sync(connector);
    reply.send(connector);
  });

  app.delete("/:id", async (request, reply) => {
    const ParamsSchema = z.object({
      id: z.string().uuid(),
    });

    const parsed = ParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      reply.status(400).send({
        error: "VALIDATION_ERROR",
        message: "Invalid connector ID",
      });
      return;
    }

    const existing = await connectorRepo.get(parsed.data.id);
    const deleted = await connectorRepo.delete(parsed.data.id);
    if (!deleted || !existing) {
      reply.status(404).send({
        error: "NOT_FOUND",
        message: "Connector not found",
      });
      return;
    }

    await connectorLifecycle?.stop(existing.id);
    reply.status(204).send();
  });

  app.get("/:id/events", async (request, reply) => {
    const ParamsSchema = z.object({
      id: z.string().uuid(),
    });

    const QuerySchema = z.object({
      status: z.enum(["pending", "submitted", "failed", "filtered"]).optional(),
      limit: z.coerce.number().int().positive().max(100).default(50),
      offset: z.coerce.number().int().min(0).default(0),
    });

    const paramsResult = ParamsSchema.safeParse(request.params);
    const queryResult = QuerySchema.safeParse(request.query);

    if (!paramsResult.success || !queryResult.success) {
      reply.status(400).send({
        error: "VALIDATION_ERROR",
        message: "Invalid request",
      });
      return;
    }

    const events = await eventRepo.listByConnectorId(
      paramsResult.data.id,
      queryResult.data,
    );

    reply.send(events);
  });
}
