import type { Connector, RabbitMqQueueConfig } from "@senclaw/protocol";
import type {
  QueueDriver,
  QueueMessage,
  QueueSubscription,
} from "./queue-connector.js";

interface RabbitMqConsumedMessage {
  content: Buffer;
}

interface RabbitMqChannel {
  assertExchange(
    exchange: string,
    type: string,
    options: { durable: boolean },
  ): Promise<unknown> | unknown;
  assertQueue(
    queue: string,
    options: { durable: boolean; arguments?: Record<string, string> },
  ): Promise<unknown> | unknown;
  bindQueue(
    queue: string,
    exchange: string,
    routingKey: string,
  ): Promise<unknown> | unknown;
  prefetch(count: number): Promise<unknown> | unknown;
  consume(
    queue: string,
    onMessage: (
      message: RabbitMqConsumedMessage | null,
    ) => Promise<void> | void,
  ): Promise<{ consumerTag: string }> | { consumerTag: string };
  ack(message: RabbitMqConsumedMessage): void;
  nack(
    message: RabbitMqConsumedMessage,
    allUpTo?: boolean,
    requeue?: boolean,
  ): void;
  close(): Promise<void> | void;
}

interface RabbitMqConnection {
  createChannel(): Promise<RabbitMqChannel> | RabbitMqChannel;
  on(event: "close", handler: () => void): void;
  removeListener?(event: "close", handler: () => void): void;
  close(): Promise<void> | void;
}

type RabbitMqConnect = (url: string) => Promise<RabbitMqConnection>;
type ReconnectScheduler = (work: () => Promise<void>) => Promise<void> | void;

export interface RabbitMqQueueDriverOptions {
  connect?: RabbitMqConnect;
  scheduleReconnect?: ReconnectScheduler;
  logger?: Pick<Console, "error" | "info" | "warn">;
}

async function loadRabbitMqConnection(
  url: string,
): Promise<RabbitMqConnection> {
  const moduleName = "amqplib";
  const rabbitMqModule = (await import(moduleName)) as {
    connect?: RabbitMqConnect;
    default?: { connect?: RabbitMqConnect };
  };
  const connect = rabbitMqModule.connect ?? rabbitMqModule.default?.connect;

  if (typeof connect !== "function") {
    throw new Error(
      "The 'amqplib' package is required for RabbitMQ queue support",
    );
  }

  return connect(url);
}

function defaultReconnectScheduler(work: () => Promise<void>): void {
  setTimeout(() => {
    void work();
  }, 1000);
}

function getRabbitMqConfig(connector: Connector): RabbitMqQueueConfig {
  if (
    connector.type !== "queue" ||
    connector.config.type !== "queue" ||
    connector.config.provider !== "rabbitmq"
  ) {
    throw new Error(
      "RabbitMqQueueDriver only supports RabbitMQ queue connectors",
    );
  }

  return connector.config;
}

function createQueueMessage(
  payload: unknown,
  channel: RabbitMqChannel,
  message: RabbitMqConsumedMessage,
): QueueMessage {
  return {
    payload,
    async ack() {
      channel.ack(message);
    },
    async nack(requeue = false) {
      channel.nack(message, false, requeue);
    },
  };
}

export class RabbitMqQueueDriver implements QueueDriver {
  private readonly connect: RabbitMqConnect;
  private readonly scheduleReconnect: ReconnectScheduler;
  private readonly logger: Pick<Console, "error" | "info" | "warn">;

  constructor(options: RabbitMqQueueDriverOptions = {}) {
    this.connect = options.connect ?? loadRabbitMqConnection;
    this.scheduleReconnect =
      options.scheduleReconnect ?? defaultReconnectScheduler;
    this.logger = options.logger ?? console;
  }

  async subscribe(
    connector: Connector,
    onMessage: (message: QueueMessage) => Promise<void>,
  ): Promise<QueueSubscription> {
    const config = getRabbitMqConfig(connector);
    const durable = config.durable ?? true;
    const queueArguments: Record<string, string> = {};

    if (config.deadLetterExchange) {
      queueArguments["x-dead-letter-exchange"] = config.deadLetterExchange;
    }
    if (config.deadLetterRoutingKey) {
      queueArguments["x-dead-letter-routing-key"] = config.deadLetterRoutingKey;
    }

    let closed = false;
    let recovering = false;
    let connection: RabbitMqConnection | undefined;
    let channel: RabbitMqChannel | undefined;
    let closeHandler: (() => void) | undefined;

    const cleanup = async (): Promise<void> => {
      const activeConnection = connection;
      const activeChannel = channel;
      const activeCloseHandler = closeHandler;

      connection = undefined;
      channel = undefined;
      closeHandler = undefined;

      if (
        activeConnection &&
        activeCloseHandler &&
        activeConnection.removeListener
      ) {
        activeConnection.removeListener("close", activeCloseHandler);
      }
      if (activeChannel) {
        await activeChannel.close();
      }
      if (activeConnection) {
        await activeConnection.close();
      }
    };

    const recover = async (): Promise<void> => {
      if (closed || recovering) {
        return;
      }

      recovering = true;
      try {
        await this.scheduleReconnect(async () => {
          if (closed) {
            return;
          }
          await openSubscription();
          this.logger.info?.("Recovered RabbitMQ queue subscription");
        });
      } catch (error) {
        this.logger.error?.(
          "Failed to recover RabbitMQ queue subscription",
          error,
        );
      } finally {
        recovering = false;
      }
    };

    const openSubscription = async (): Promise<void> => {
      connection = await this.connect(config.url);
      channel = await connection.createChannel();

      if (config.exchange) {
        await channel.assertExchange(
          config.exchange,
          config.exchangeType ?? "direct",
          { durable },
        );
      }

      await channel.assertQueue(config.queue, {
        durable,
        arguments:
          Object.keys(queueArguments).length > 0 ? queueArguments : undefined,
      });

      if (config.exchange) {
        await channel.bindQueue(
          config.queue,
          config.exchange,
          config.routingKey ?? "",
        );
      }

      if (config.prefetch) {
        await channel.prefetch(config.prefetch);
      }

      const activeConnection = connection;
      const activeChannel = channel;
      closeHandler = () => {
        if (closed) {
          return;
        }
        if (activeConnection.removeListener && closeHandler) {
          activeConnection.removeListener("close", closeHandler);
        }
        connection = undefined;
        channel = undefined;
        closeHandler = undefined;
        void recover();
      };
      activeConnection.on("close", closeHandler);

      await activeChannel.consume(config.queue, async (message) => {
        if (!message) {
          return;
        }

        try {
          const payload = JSON.parse(message.content.toString("utf8"));
          await onMessage(createQueueMessage(payload, activeChannel, message));
        } catch (error) {
          this.logger.error?.("Failed to process RabbitMQ message", error);
          activeChannel.nack(message, false, false);
        }
      });
    };

    await openSubscription();

    return {
      close: async () => {
        closed = true;
        await cleanup();
      },
    };
  }
}
