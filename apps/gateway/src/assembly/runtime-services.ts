import {
  AgentService,
  InMemoryAgentRepository,
  InMemoryMessageRepository,
  InMemoryRunRepository,
} from "@senclaw/agent-runner";
import type { SenclawConfig } from "@senclaw/config";
import { createChildLogger } from "@senclaw/logging";
import type { HealthCheck } from "@senclaw/observability";
import type {
  IAuditLogRepository,
  IConnectorEventRepository,
  IConnectorRepository,
} from "@senclaw/protocol";
import { SchedulerService } from "@senclaw/scheduler";
import { createStorage, type StorageBundle } from "@senclaw/storage";
import type { FastifyInstance } from "fastify";
import type { Logger } from "pino";
import { ApiKeyService } from "../auth/api-key-service.js";
import {
  InMemoryApiKeyRepository,
  InMemoryAuditLogRepository,
} from "../auth/repositories.js";
import {
  InMemoryExecutionRepository,
  InMemoryJobRepository,
} from "../scheduler-repositories.js";
import {
  createRuntimeSettingsStore,
  type RuntimeSettingsStore,
} from "../runtime-settings.js";
import type { ToolRegistry } from "@senclaw/tool-runner-host";

export interface GatewayRuntimeServices {
  checks: Record<string, HealthCheck>;
  storage?: StorageBundle;
  apiKeyService: ApiKeyService;
  auditLogRepository: IAuditLogRepository;
  agentService: AgentService;
  schedulerService: SchedulerService;
  connectorRepo: IConnectorRepository;
  connectorEventRepo: IConnectorEventRepository;
  runtimeSettingsStore: RuntimeSettingsStore;
}

interface CreateGatewayRuntimeServicesOptions {
  app: FastifyInstance;
  config: SenclawConfig;
  logger: Logger;
  toolRegistry: ToolRegistry;
  runtimeSettingsPath: string;
}

export function createGatewayRuntimeServices(
  options: CreateGatewayRuntimeServicesOptions,
): GatewayRuntimeServices {
  const { app, config, logger, toolRegistry, runtimeSettingsPath } = options;
  const checks: Record<string, HealthCheck> = {
    gateway: { check: () => ({ status: "healthy" as const }) },
  };

  const runtimeSettingsStore = createRuntimeSettingsStore(runtimeSettingsPath);
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

  const schedulerService = new SchedulerService(
    agentService,
    storage?.jobs ?? new InMemoryJobRepository(),
    storage?.executions ?? new InMemoryExecutionRepository(),
    {
      tickIntervalMs: config.schedulerTickIntervalMs,
      logger: createChildLogger(logger, { component: "scheduler" }),
    },
  );

  const connectorRepo: IConnectorRepository = storage?.connectors ?? {
    create: async () => ({
      id: "",
      name: "",
      type: "webhook" as const,
      agentId: "",
      config: { type: "webhook" as const, secret: "" },
      transformation: {},
      enabled: true,
      createdAt: "",
      updatedAt: "",
    }),
    get: async () => undefined,
    list: async () => [],
    update: async () => undefined,
    delete: async () => false,
    updateLastEventAt: async () => {},
  };

  const connectorEventRepo: IConnectorEventRepository =
    storage?.connectorEvents ?? {
      create: async () => ({
        id: "",
        connectorId: "",
        payload: "",
        status: "pending" as const,
        receivedAt: "",
      }),
      get: async () => undefined,
      listByConnectorId: async () => [],
      update: async () => {},
    };

  return {
    checks,
    storage,
    apiKeyService,
    auditLogRepository,
    agentService,
    schedulerService,
    connectorRepo,
    connectorEventRepo,
    runtimeSettingsStore,
  };
}
