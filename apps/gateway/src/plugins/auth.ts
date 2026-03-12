import { randomUUID } from "node:crypto";
import rateLimit from "@fastify/rate-limit";
import type { ApiKeyRole } from "@senclaw/protocol";
import type { IAuditLogRepository } from "@senclaw/protocol";
import fp from "fastify-plugin";
import type { Logger } from "pino";
import type { ApiKeyService } from "../auth/api-key-service.js";

function isPublicRoute(url: string): boolean {
  const path = url.split("?")[0] ?? url;
  return (
    path === "/health" ||
    path === "/metrics" ||
    path === "/api/runtime/settings" ||
    path.startsWith("/webhooks/")
  );
}

function redactBody(body: unknown): string | null {
  if (!body || typeof body !== "object") {
    return body == null ? null : JSON.stringify(body);
  }

  const copy = { ...(body as Record<string, unknown>) };
  for (const field of ["password", "token", "secret", "apiKey", "key"]) {
    if (field in copy) {
      copy[field] = "***REDACTED***";
    }
  }

  const json = JSON.stringify(copy);
  return json.length <= 1024 ? json : `${json.slice(0, 1024)}... (truncated)`;
}

function resolveApiKey(request: {
  headers: Record<string, unknown>;
  query: unknown;
}): string | undefined {
  const authHeader = request.headers.authorization;
  if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7).trim();
  }

  if (request.query && typeof request.query === "object") {
    const queryKey = (request.query as Record<string, unknown>).api_key;
    return typeof queryKey === "string" ? queryKey : undefined;
  }

  return undefined;
}

export const authPlugin = fp<{
  apiKeyService: ApiKeyService;
  auditLogRepository: IAuditLogRepository;
  logger: Logger;
  auditLogRetentionDays?: number;
  rateLimits?: Partial<Record<ApiKeyRole, number>>;
}>(async (app, opts) => {
  const rateLimits: Record<ApiKeyRole, number> = {
    admin: opts.rateLimits?.admin ?? 1000,
    user: opts.rateLimits?.user ?? 100,
    readonly: opts.rateLimits?.readonly ?? 50,
  };

  app.decorateRequest("apiKey", undefined);

  app.addHook("preHandler", async (request, reply) => {
    if (isPublicRoute(request.url)) {
      return;
    }

    const rawKey = resolveApiKey(request);
    if (!rawKey) {
      reply.status(401).send({
        error: "UNAUTHORIZED",
        message:
          "API key required. Provide Authorization: Bearer <key> or ?api_key=<key>.",
      });
      return;
    }

    const result = await opts.apiKeyService.authenticateApiKey(rawKey);
    if ("error" in result) {
      reply.status(401).send(result);
      return;
    }

    request.apiKey = result.apiKey;
    void opts.apiKeyService.updateLastUsed(result.apiKey.id).catch((error) => {
      opts.logger.error(
        { error, keyId: result.apiKey.id },
        "Failed to update api key usage",
      );
    });
  });

  await app.register(rateLimit, {
    global: true,
    hook: "preHandler",
    timeWindow: "1 minute",
    keyGenerator: (request) => request.apiKey?.id ?? request.ip,
    max: (request) => rateLimits[request.apiKey?.role ?? "readonly"],
    allowList: async (request) => isPublicRoute(request.url),
    addHeadersOnExceeding: {
      "x-ratelimit-limit": true,
      "x-ratelimit-remaining": true,
      "x-ratelimit-reset": true,
    },
    addHeaders: {
      "x-ratelimit-limit": true,
      "x-ratelimit-remaining": true,
      "x-ratelimit-reset": true,
      "retry-after": true,
    },
    errorResponseBuilder: (_request, context) => ({
      statusCode: 429,
      error: "RATE_LIMIT_EXCEEDED",
      message: `Rate limit exceeded. Try again in ${Math.ceil(context.ttl / 1000)} seconds.`,
      retryAfter: Math.ceil(context.ttl / 1000),
      limit: context.max,
      remaining: 0,
    }),
  });

  app.addHook("onResponse", async (request, reply) => {
    if (isPublicRoute(request.url) || !request.apiKey) {
      return;
    }

    try {
      await opts.auditLogRepository.create({
        id: randomUUID(),
        keyId: request.apiKey.id,
        method: request.method,
        path: request.url.split("?")[0] ?? request.url,
        status: reply.statusCode,
        ip: request.ip,
        userAgent:
          typeof request.headers["user-agent"] === "string"
            ? request.headers["user-agent"]
            : null,
        requestBody: redactBody(request.body),
        responseTimeMs: Math.max(0, Math.round(reply.elapsedTime)),
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      opts.logger.error({ error }, "Failed to write audit log");
    }
  });

  const cleanupInterval = setInterval(
    async () => {
      try {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - (opts.auditLogRetentionDays ?? 90));
        await opts.auditLogRepository.deleteOlderThan(cutoff.toISOString());
      } catch (error) {
        opts.logger.error({ error }, "Failed to clean up audit logs");
      }
    },
    24 * 60 * 60 * 1000,
  );

  app.addHook("onClose", async () => {
    clearInterval(cleanupInterval);
  });
});
