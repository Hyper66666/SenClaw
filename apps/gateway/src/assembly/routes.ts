import type { AgentService } from "@senclaw/agent-runner";
import type { HealthCheck } from "@senclaw/observability";
import type {
  IAuditLogRepository,
  IConnectorEventRepository,
  IConnectorRepository,
} from "@senclaw/protocol";
import type { SchedulerService } from "@senclaw/scheduler";
import type { FastifyInstance } from "fastify";
import type { ApprovalQueue } from "../approval-queue.js";
import type { ApiKeyService } from "../auth/api-key-service.js";
import { agentRoutes } from "../routes/agents.js";
import { approvalRoutes } from "../routes/approvals.js";
import {
  connectorRoutes,
  type ConnectorLifecycle,
} from "../routes/connectors.js";
import { healthRoutes } from "../routes/health.js";
import { jobRoutes } from "../routes/jobs.js";
import { keyRoutes } from "../routes/keys.js";
import { runRoutes } from "../routes/runs.js";
import { runtimeSettingsRoutes } from "../routes/runtime-settings.js";
import { taskRoutes } from "../routes/tasks.js";
import { webhookRoutes } from "../routes/webhooks.js";
import type { RuntimeSettingsStore } from "../runtime-settings.js";
import type {
  GatewayEventProcessor,
  GatewayWebhookConnector,
} from "./connectors.js";

interface RegisterGatewayRoutesOptions {
  app: FastifyInstance;
  agentService: AgentService;
  schedulerService: SchedulerService;
  connectorRepo: IConnectorRepository;
  connectorEventRepo: IConnectorEventRepository;
  eventProcessor: GatewayEventProcessor;
  webhookConnector: GatewayWebhookConnector | null;
  connectorLifecycle: ConnectorLifecycle;
  runtimeSettingsStore: RuntimeSettingsStore;
  approvalQueue: ApprovalQueue;
  apiKeyService: ApiKeyService;
  auditLogRepository: IAuditLogRepository;
  checks: Record<string, HealthCheck>;
}

export async function registerGatewayRoutes(
  options: RegisterGatewayRoutesOptions,
): Promise<void> {
  const {
    app,
    agentService,
    schedulerService,
    connectorRepo,
    connectorEventRepo,
    eventProcessor,
    webhookConnector,
    connectorLifecycle,
    runtimeSettingsStore,
    approvalQueue,
    apiKeyService,
    auditLogRepository,
    checks,
  } = options;

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

  await app.register(jobRoutes, {
    prefix: "/api/v1/jobs",
    schedulerService,
  });

  await app.register(connectorRoutes, {
    prefix: "/api/v1/connectors",
    connectorRepo,
    eventRepo: connectorEventRepo,
    eventProcessor,
    connectorLifecycle,
  });

  await app.register(webhookRoutes, {
    prefix: "/webhooks",
    connectorRepo,
    webhookConnector,
  });

  await app.register(runtimeSettingsRoutes, {
    prefix: "/api/runtime/settings",
    store: runtimeSettingsStore,
  });

  await app.register(approvalRoutes, {
    prefix: "/api/runtime/approvals",
    approvalQueue,
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

  await app.register(healthRoutes, {
    prefix: "/api/runtime/health",
    checks,
  });
}
