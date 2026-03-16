import type { AgentService } from "@senclaw/agent-runner";
import type {
  Connector,
  IConnectorEventRepository,
  IConnectorRepository,
} from "@senclaw/protocol";
import type { Logger } from "pino";
import type { ConnectorLifecycle } from "../routes/connectors.js";

export type RuntimeConnector = Connector;

export type QueueMessageLike = {
  payload: unknown;
  ack(): Promise<void> | void;
  nack(requeue?: boolean): Promise<void> | void;
};

export interface QueueDriverLike {
  subscribe(
    connector: RuntimeConnector,
    onMessage: (message: QueueMessageLike) => Promise<void>,
  ): Promise<{ close(): Promise<void> | void }>;
}

export interface PollingFetcherLike {
  fetch(
    url: string,
    init?: {
      method?: string;
      headers?: Record<string, string>;
    },
  ): Promise<{
    ok: boolean;
    status: number;
    headers: {
      get(name: string): string | null;
    };
    text(): Promise<string>;
  }>;
}

export interface GatewayEventProcessor {
  processEvent(connector: RuntimeConnector, payload: unknown): Promise<void>;
}

export interface GatewayWebhookConnector {
  validateWebhook(
    connector: RuntimeConnector,
    signature?: string,
    rawBody?: string,
  ): void;
  handleWebhook(
    connector: RuntimeConnector,
    payload: unknown,
    signature?: string,
    rawBody?: string,
  ): Promise<void>;
}

export interface GatewayConnectorRuntime {
  eventProcessor: GatewayEventProcessor;
  webhookConnector: GatewayWebhookConnector | null;
  connectorLifecycle: ConnectorLifecycle;
  close(): Promise<void>;
}

interface CreateConnectorRuntimeOptions {
  agentService: AgentService;
  connectorRepo: IConnectorRepository;
  connectorEventRepo: IConnectorEventRepository;
  logger: Logger;
  queueDriver?: QueueDriverLike;
  pollingFetcher?: PollingFetcherLike;
}

export async function createConnectorRuntime(
  options: CreateConnectorRuntimeOptions,
): Promise<GatewayConnectorRuntime> {
  const {
    agentService,
    connectorRepo,
    connectorEventRepo,
    logger,
    queueDriver,
    pollingFetcher,
  } = options;

  let eventProcessor: GatewayEventProcessor | null;
  let webhookConnector: GatewayWebhookConnector | null;
  let queueConnector: {
    start(connector: RuntimeConnector): Promise<unknown>;
    stop(connectorId?: string): Promise<void>;
  } | null;
  let pollingConnector: {
    start(connector: RuntimeConnector): void;
    stop(connectorId?: string): void;
  } | null;

  try {
    const connectorWorker = await import("@senclaw/connector-worker");
    const workerEventProcessor = new connectorWorker.EventProcessor(
      agentService,
      connectorEventRepo,
    );

    eventProcessor = workerEventProcessor;
    webhookConnector = new connectorWorker.WebhookConnector(
      workerEventProcessor,
    );
    queueConnector = new connectorWorker.QueueConnector(
      workerEventProcessor,
      queueDriver ?? new connectorWorker.BrokerQueueDriver(),
    );
    pollingConnector = new connectorWorker.PollingConnector(
      workerEventProcessor,
      pollingFetcher,
    );
  } catch (error) {
    logger.warn(
      { error },
      "Connector worker not available, connector features disabled",
    );
    eventProcessor = null;
    webhookConnector = null;
    queueConnector = null;
    pollingConnector = null;
  }

  const activeEventProcessor: GatewayEventProcessor = eventProcessor ?? {
    processEvent: async () => undefined,
  };

  const connectorLifecycle: ConnectorLifecycle = {
    sync: async (connector) => {
      await queueConnector?.stop(connector.id);
      pollingConnector?.stop(connector.id);

      if (!connector.enabled) {
        return;
      }

      if (connector.type === "queue") {
        await queueConnector?.start(connector);
        return;
      }

      if (connector.type === "polling") {
        pollingConnector?.start(connector);
      }
    },
    stop: async (connectorId) => {
      await queueConnector?.stop(connectorId);
      pollingConnector?.stop(connectorId);
    },
  };

  for (const connector of await connectorRepo.list({ enabled: true })) {
    try {
      await connectorLifecycle.sync(connector);
    } catch (error) {
      logger.error(
        {
          error,
          connectorId: connector.id,
          connectorType: connector.type,
        },
        "Failed to initialize connector lifecycle",
      );
    }
  }

  return {
    eventProcessor: activeEventProcessor,
    webhookConnector,
    connectorLifecycle,
    close: async () => {
      await queueConnector?.stop();
      pollingConnector?.stop();
    },
  };
}
