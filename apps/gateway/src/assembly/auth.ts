import type { SenclawConfig } from "@senclaw/config";
import type { IAuditLogRepository } from "@senclaw/protocol";
import type { FastifyInstance } from "fastify";
import type { Logger } from "pino";
import type { ApiKeyService } from "../auth/api-key-service.js";
import { authPlugin } from "../plugins/auth.js";

interface RegisterGatewayAuthOptions {
  app: FastifyInstance;
  config: SenclawConfig;
  logger: Logger;
  apiKeyService: ApiKeyService;
  auditLogRepository: IAuditLogRepository;
}

export async function registerGatewayAuth(
  options: RegisterGatewayAuthOptions,
): Promise<{ bootstrapAdminKey?: string }> {
  const { app, config, logger, apiKeyService, auditLogRepository } = options;
  const bootstrapAdminKey = await apiKeyService.ensureBootstrapAdminKey({
    print: !process.env.VITEST,
  });

  await app.register(authPlugin, {
    apiKeyService,
    auditLogRepository,
    logger,
    auditLogRetentionDays: config.auditLogRetentionDays,
    rateLimits: {
      admin: config.rateLimitAdmin,
      user: config.rateLimitUser,
      readonly: config.rateLimitReadonly,
    },
  });

  return { bootstrapAdminKey };
}
