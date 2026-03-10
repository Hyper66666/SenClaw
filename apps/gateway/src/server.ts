import Fastify from "fastify";
import {
  AgentService,
  InMemoryAgentRepository,
  InMemoryMessageRepository,
  InMemoryRunRepository,
} from "@senclaw/agent-runner";
import { loadConfig } from "@senclaw/config";
import {
  createChildLogger,
  createLogger,
  resolveLogLevel,
  shouldSampleLog,
} from "@senclaw/logging";
import {
  configureMetricsRegistry,
  extractTraceContext,
  initializeTracing,
  runWithContext,
  setSpanError,
  setSpanOk,
  startSpan,
  type TraceExporter,
  type TracingSpan,
  type HealthCheck,
} from "@senclaw/observability";
import { createStorage } from "@senclaw/storage";
import { ToolRegistry, registerBuiltinTools } from "@senclaw/tool-runner-host";
import type { DestinationStream, LevelWithSilent, Logger } from "pino";
import { ApiKeyService } from "./auth/api-key-service.js";
import {
  InMemoryApiKeyRepository,
  InMemoryAuditLogRepository,
} from "./auth/repositories.js";
import { authPlugin } from "./plugins/auth.js";
import { correlationIdPlugin } from "./plugins/correlation-id.js";
import { errorHandlerPlugin } from "./plugins/error-handler.js";
import { agentRoutes } from "./routes/agents.js";
import { healthRoutes } from "./routes/health.js";
import { keyRoutes } from "./routes/keys.js";
import { runRoutes } from "./routes/runs.js";
import { taskRoutes } from "./routes/tasks.js";

function resolveMetricPath(request: import("fastify").FastifyRequest): string {
  const routePath =
    "routeOptions" in request &&
    request.routeOptions &&
    typeof request.routeOptions.url === "string"
      ? request.routeOptions.url
      : undefined;
  return routePath ?? request.url.split("?")[0] ?? request.url;
}

export interface CreateServerOptions {
  tracingExporter?: TraceExporter;
  autoInstrumentations?: boolean;
  loggerDestination?: DestinationStream;
}

const HIGH_VOLUME_PATHS = new Set(["/health", "/metrics"]);

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readRequestObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function requestLogLevel(
  defaultLevel: LevelWithSilent,
  path: string,
  userId: string | undefined,
  endpointLevels: Partial<Record<string, LevelWithSilent>>,
  userLevels: Partial<Record<string, LevelWithSilent>>,
): LevelWithSilent {
  if (defaultLevel !== "info") {
    return defaultLevel;
  }

  return resolveLogLevel({
    defaultLevel,
    endpoint: path,
    userId,
    endpointLevels,
    userLevels,
  });
}

function extractRequestLogFields(
  request: import("fastify").FastifyRequest,
  path: string,
): Record<string, unknown> {
  const params = readRequestObject(request.params);
  const body = readRequestObject(request.body);
  const fields: Record<string, unknown> = {
    userId: request.apiKey?.createdBy,
    agentId: readOptionalString(body.agentId),
    runId: undefined,
    toolName: readOptionalString(body.toolName),
  };

  if (!fields.agentId && path.startsWith("/api/v1/agents/")) {
    fields.agentId = readOptionalString(params.id);
  }

  if (path.startsWith("/api/v1/runs/")) {
    fields.runId = readOptionalString(params.id);
  }

  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined),
  );
}

function writeLog(
  logger: Logger,
  level: LevelWithSilent,
  bindings: Record<string, unknown>,
  message: string,
): void {
  switch (level) {
    case "trace":
      logger.trace(bindings, message);
      break;
    case "debug":
      logger.debug(bindings, message);
      break;
    case "info":
      logger.info(bindings, message);
      break;
    case "warn":
      logger.warn(bindings, message);
      break;
    case "error":
      logger.error(bindings, message);
      break;
    case "fatal":
      logger.fatal(bindings, message);
      break;
    default:
      logger.info(bindings, message);
  }
}

export async function createServer(options: CreateServerOptions = {}): Promise<{
  app: import("fastify").FastifyInstance;
  config: import("@senclaw/config").SenclawConfig;
  logger: import("pino").Logger;
  bootstrapAdminKey?: string;
  apiKeyService: ApiKeyService;
}> {
  const config = loadConfig();
  const metrics = configureMetricsRegistry({
    enabled: config.metricsEnabled,
  });
  const logger = createLogger(
    "gateway",
    config.logLevel,
    options.loggerDestination,
  );
  const endpointLevels = Object.fromEntries(
    config.logDebugEndpoints.map((path) => [path, "debug" as const]),
  );
  const userLevels = Object.fromEntries(
    config.logDebugUsers.map((userId) => [userId, "debug" as const]),
  );
  const tracing = await initializeTracing({
    serviceName: "senclaw-gateway",
    enabled: config.tracingEnabled,
    endpoint: config.tracingEndpoint,
    exporter: options.tracingExporter,
    autoInstrumentations: options.autoInstrumentations,
  });

  const app = Fastify({
    logger: false,
  });

  const requestSpans = new WeakMap<
    import("fastify").FastifyRequest,
    TracingSpan
  >();

  await app.register(correlationIdPlugin);
  await app.register(errorHandlerPlugin);

  if (config.metricsEnabled) {
    app.get("/metrics", async (_request, reply) => {
      reply.header("content-type", metrics.contentType());
      return metrics.metrics();
    });

    app.addHook("onResponse", async (request, reply) => {
      metrics.recordHttpRequest({
        method: request.method,
        path: resolveMetricPath(request),
        status: String(reply.statusCode),
        durationSeconds: Math.max(0, reply.elapsedTime) / 1000,
      });
    });
  }

  app.addHook("onResponse", async (request, reply) => {
    const path = resolveMetricPath(request);
    const correlationId = readOptionalString(
      reply.getHeader("x-correlation-id"),
    );
    const userId = request.apiKey?.createdBy;
    const defaultLevel: LevelWithSilent =
      reply.statusCode >= 500
        ? "error"
        : reply.statusCode >= 400
          ? "warn"
          : "info";
    const level = requestLogLevel(
      defaultLevel,
      path,
      userId,
      endpointLevels,
      userLevels,
    );
    const isSampled =
      !HIGH_VOLUME_PATHS.has(path) ||
      shouldSampleLog(
        `${request.method}:${path}:${correlationId ?? request.id}`,
        config.logSamplingRate,
      );

    if (!isSampled && level === defaultLevel) {
      return;
    }

    const requestLogger = createChildLogger(
      logger,
      {
        method: request.method,
        path,
        statusCode: reply.statusCode,
        ...extractRequestLogFields(request, path),
      },
      { level },
    );
    writeLog(
      requestLogger,
      level,
      {
        durationMs: Math.max(0, Math.round(reply.elapsedTime)),
      },
      "Request completed",
    );
  });

  if (tracing.enabled) {
    app.addHook("onRequest", (request, _reply, done) => {
      const path = resolveMetricPath(request);
      const parentContext = extractTraceContext(
        request.headers as Record<string, unknown>,
      );
      const { span, traceContext } = startSpan(`${request.method} ${path}`, {
        tracerName: "senclaw-gateway",
        kind: "server",
        parentContext,
        attributes: {
          "http.method": request.method,
          "http.route": path,
        },
      });

      requestSpans.set(request, span);
      runWithContext(traceContext, done);
    });

    app.addHook("onError", async (request, _reply, error) => {
      const span = requestSpans.get(request);
      if (span) {
        setSpanError(span, error);
      }
      logger.error(
        {
          error,
          method: request.method,
          path: resolveMetricPath(request),
          ...extractRequestLogFields(request, resolveMetricPath(request)),
        },
        "Request failed before response completed",
      );
    });

    app.addHook("onResponse", async (request, reply) => {
      const span = requestSpans.get(request);
      if (!span) {
        return;
      }

      span.setAttribute("http.status_code", reply.statusCode);
      if (reply.statusCode >= 500) {
        setSpanError(span, `HTTP ${reply.statusCode}`);
      } else {
        setSpanOk(span);
      }
      span.end();
      requestSpans.delete(request);
    });

    app.addHook("onClose", async () => {
      await tracing.shutdown();
    });
  }

  const toolRegistry = new ToolRegistry(config.toolTimeoutMs);
  registerBuiltinTools(toolRegistry);

  const checks: Record<string, HealthCheck> = {
    gateway: { check: () => ({ status: "healthy" as const }) },
  };

  const storage = config.dbUrl ? createStorage(config.dbUrl) : undefined;
  if (storage) {
    checks.storage = storage.healthCheck;
    app.addHook("onClose", async () => {
      storage.close();
    });
  }

  const apiKeyRepository = storage?.apiKeys ?? new InMemoryApiKeyRepository();
  const auditLogRepository =
    storage?.auditLogs ?? new InMemoryAuditLogRepository();
  const apiKeyService = new ApiKeyService(apiKeyRepository);
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

  const agentService = new AgentService(
    toolRegistry,
    {
      maxTurns: config.maxTurns,
      llmTimeoutMs: config.llmTimeoutMs,
    },
    storage?.agents ?? new InMemoryAgentRepository(),
    storage?.runs ?? new InMemoryRunRepository(),
    storage?.messages ?? new InMemoryMessageRepository(),
  );

  await app.register(agentRoutes, {
    prefix: "/api/v1/agents",
    agentService,
  });

  await app.register(taskRoutes, {
    prefix: "/api/v1/tasks",
    agentService,
  });

  await app.register(runRoutes, {
    prefix: "/api/v1/runs",
    agentService,
  });

  await app.register(keyRoutes, {
    prefix: "/api/v1/keys",
    apiKeyService,
    auditLogRepository,
  });

  await app.register(healthRoutes, {
    prefix: "/health",
    checks,
  });

  return { app, config, logger, bootstrapAdminKey, apiKeyService };
}

export async function startServer() {
  const { app, config, logger } = await createServer();
  const port = config.gatewayPort;

  await app.listen({ port, host: "0.0.0.0" });
  logger.info({ port }, "Gateway listening");

  return app;
}
