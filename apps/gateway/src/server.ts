import {
  loadConfig,
  loadGlobalPermissionsConfig,
  resolveLocalRuntimeFiles,
} from "@senclaw/config";
import {
  createChildLogger,
  createLogger,
  resolveLogLevel,
  shouldSampleLog,
} from "@senclaw/logging";
import {
  type TraceExporter,
  type TracingSpan,
  configureMetricsRegistry,
  extractTraceContext,
  initializeTracing,
  runWithContext,
  setSpanError,
  setSpanOk,
  startSpan,
} from "@senclaw/observability";
import { registerBuiltinTools, ToolRegistry } from "@senclaw/tool-runner-host";
import Fastify from "fastify";
import type { DestinationStream, LevelWithSilent, Logger } from "pino";
import { ApprovalQueue } from "./approval-queue.js";
import { registerGatewayAuth } from "./assembly/auth.js";
import {
  createConnectorRuntime,
  type PollingFetcherLike,
  type QueueDriverLike,
} from "./assembly/connectors.js";
import { registerGatewayRoutes } from "./assembly/routes.js";
import { createGatewayRuntimeServices } from "./assembly/runtime-services.js";
import type { ApiKeyService } from "./auth/api-key-service.js";
import { correlationIdPlugin } from "./plugins/correlation-id.js";
import { errorHandlerPlugin } from "./plugins/error-handler.js";

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
  queueDriver?: QueueDriverLike;
  pollingFetcher?: PollingFetcherLike;
  runtimeSettingsPath?: string;
  approvalQueue?: ApprovalQueue;
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
  const approvalQueue = options.approvalQueue ?? new ApprovalQueue();
  const permissions = loadGlobalPermissionsConfig();
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
  registerBuiltinTools(toolRegistry, {
    permissions,
    requestApproval(request) {
      return approvalQueue.create(request).id;
    },
  });

  const runtimeServices = createGatewayRuntimeServices({
    app,
    config,
    logger,
    toolRegistry,
    runtimeSettingsPath:
      options.runtimeSettingsPath ??
      resolveLocalRuntimeFiles(process.cwd()).settingsFile,
  });

  const { bootstrapAdminKey } = await registerGatewayAuth({
    app,
    config,
    logger,
    apiKeyService: runtimeServices.apiKeyService,
    auditLogRepository: runtimeServices.auditLogRepository,
  });

  const connectorRuntime = await createConnectorRuntime({
    agentService: runtimeServices.agentService,
    connectorRepo: runtimeServices.connectorRepo,
    connectorEventRepo: runtimeServices.connectorEventRepo,
    logger,
    queueDriver: options.queueDriver,
    pollingFetcher: options.pollingFetcher,
  });

  app.addHook("onClose", async () => {
    await connectorRuntime.close();
  });

  await registerGatewayRoutes({
    app,
    agentService: runtimeServices.agentService,
    schedulerService: runtimeServices.schedulerService,
    connectorRepo: runtimeServices.connectorRepo,
    connectorEventRepo: runtimeServices.connectorEventRepo,
    eventProcessor: connectorRuntime.eventProcessor,
    webhookConnector: connectorRuntime.webhookConnector,
    connectorLifecycle: connectorRuntime.connectorLifecycle,
    runtimeSettingsStore: runtimeServices.runtimeSettingsStore,
    approvalQueue,
    apiKeyService: runtimeServices.apiKeyService,
    auditLogRepository: runtimeServices.auditLogRepository,
    checks: runtimeServices.checks,
  });

  return {
    app,
    config,
    logger,
    bootstrapAdminKey,
    apiKeyService: runtimeServices.apiKeyService,
  };
}

export async function startServer() {
  const { app, config, logger } = await createServer();
  const port = config.gatewayPort;

  await app.listen({ port, host: "0.0.0.0" });
  logger.info({ port }, "Gateway listening");

  return app;
}
