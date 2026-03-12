import {
  ApiKeyRoleSchema,
  CreateApiKeyRequestSchema,
  RevokeApiKeyRequestSchema,
} from "@senclaw/protocol";
import type { IAuditLogRepository } from "@senclaw/protocol";
import type { FastifyInstance } from "fastify";
import type { ApiKeyService } from "../auth/api-key-service.js";
import { requireRoles } from "../auth/authorization.js";

export async function keyRoutes(
  app: FastifyInstance,
  opts: {
    apiKeyService: ApiKeyService;
    auditLogRepository: IAuditLogRepository;
  },
): Promise<void> {
  const { apiKeyService, auditLogRepository } = opts;

  app.post(
    "/",
    { preHandler: requireRoles("admin") },
    async (request, reply) => {
      const requester = request.apiKey;
      if (!requester) {
        reply.status(401).send({
          error: "UNAUTHORIZED",
          message: "API key required",
        });
        return;
      }

      const parsed = CreateApiKeyRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        reply.status(400).send({
          error: "VALIDATION_ERROR",
          message: "Invalid API key request",
          details: parsed.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        });
        return;
      }

      const created = await apiKeyService.createApiKey({
        name: parsed.data.name,
        role: parsed.data.role,
        expiresAt: parsed.data.expiresAt ?? null,
        createdBy: requester.id,
      });

      reply.status(201).send({
        id: created.apiKey.id,
        key: created.rawKey,
        name: created.apiKey.name,
        role: created.apiKey.role,
        createdAt: created.apiKey.createdAt,
        expiresAt: created.apiKey.expiresAt,
      });
    },
  );

  app.get("/", { preHandler: requireRoles("admin") }, async (request) => {
    const query = request.query as Record<string, unknown>;
    const role =
      typeof query.role === "string" &&
      ApiKeyRoleSchema.safeParse(query.role).success
        ? ApiKeyRoleSchema.parse(query.role)
        : undefined;
    const revoked =
      query.revoked === "true"
        ? true
        : query.revoked === "false"
          ? false
          : undefined;
    const expired =
      query.expired === "true"
        ? true
        : query.expired === "false"
          ? false
          : undefined;

    return apiKeyService.listApiKeys({ role, revoked, expired });
  });

  app.delete<{ Params: { id: string } }>(
    "/:id",
    { preHandler: requireRoles("admin") },
    async (request, reply) => {
      const requester = request.apiKey;
      if (!requester) {
        reply.status(401).send({
          error: "UNAUTHORIZED",
          message: "API key required",
        });
        return;
      }

      const existing = await apiKeyService.getApiKey(request.params.id);
      if (!existing) {
        reply.status(404).send({
          error: "NOT_FOUND",
          message: `API key \"${request.params.id}\" not found`,
        });
        return;
      }

      if (existing.revokedAt) {
        reply.status(400).send({
          error: "KEY_ALREADY_REVOKED",
          message: "API key is already revoked",
        });
        return;
      }

      const parsed = RevokeApiKeyRequestSchema.safeParse(
        request.body ?? { reason: "revoked" },
      );
      if (!parsed.success) {
        reply.status(400).send({
          error: "VALIDATION_ERROR",
          message: "Invalid revoke request",
          details: parsed.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        });
        return;
      }

      const revoked = await apiKeyService.revokeApiKey(
        request.params.id,
        requester.id,
        parsed.data.reason,
      );
      reply.send(revoked);
    },
  );

  app.get<{ Params: { id: string } }>(
    "/:id/audit",
    { preHandler: requireRoles("admin") },
    async (request, reply) => {
      const existing = await apiKeyService.getApiKey(request.params.id);
      if (!existing) {
        reply.status(404).send({
          error: "NOT_FOUND",
          message: `API key \"${request.params.id}\" not found`,
        });
        return;
      }

      const query = request.query as Record<string, unknown>;
      const limit = typeof query.limit === "string" ? Number(query.limit) : 100;
      const offset =
        typeof query.offset === "string" ? Number(query.offset) : 0;

      const logs = await auditLogRepository.listByKeyId(request.params.id, {
        limit: Number.isFinite(limit) && limit > 0 ? limit : 100,
        offset: Number.isFinite(offset) && offset >= 0 ? offset : 0,
      });

      reply.send({
        logs,
        total: await auditLogRepository.countByKeyId(request.params.id),
        limit: Number.isFinite(limit) && limit > 0 ? limit : 100,
        offset: Number.isFinite(offset) && offset >= 0 ? offset : 0,
      });
    },
  );
}
