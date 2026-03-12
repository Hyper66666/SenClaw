import type { Connector, RedisQueueConfig } from "@senclaw/protocol";
import type {
  QueueDriver,
  QueueMessage,
  QueueSubscription,
} from "./queue-connector.js";

interface RedisStreamEntry {
  id: string;
  values: Record<string, string>;
}

interface RedisReadGroupOptions {
  stream: string;
  consumerGroup: string;
  consumerName: string;
  batchSize: number;
  blockMs: number;
}

interface RedisStreamClient {
  ensureConsumerGroup(stream: string, consumerGroup: string): Promise<void>;
  readGroup(options: RedisReadGroupOptions): Promise<RedisStreamEntry[]>;
  ack(stream: string, consumerGroup: string, id: string): Promise<void>;
  delete(stream: string, id: string): Promise<void>;
  publish(stream: string, payload: unknown): Promise<string>;
  close(): Promise<void> | void;
  onClose(handler: () => void): void;
  offClose?(handler: () => void): void;
}

type RedisClientFactory = (url: string) => Promise<RedisStreamClient>;
type ReconnectScheduler = (work: () => Promise<void>) => Promise<void> | void;

export interface RedisQueueDriverOptions {
  createClient?: RedisClientFactory;
  scheduleReconnect?: ReconnectScheduler;
  logger?: Pick<Console, "error" | "info" | "warn">;
}

type RedisConstructor = new (
  url: string,
) => {
  on(event: "close", handler: () => void): void;
  off?(event: "close", handler: () => void): void;
  removeListener?(event: "close", handler: () => void): void;
  quit(): Promise<void>;
  xgroup(...args: string[]): Promise<unknown>;
  xreadgroup(...args: Array<string | number>): Promise<unknown>;
  xack(stream: string, consumerGroup: string, id: string): Promise<void>;
  xdel(stream: string, id: string): Promise<void>;
  xadd(
    stream: string,
    id: string,
    field: string,
    value: string,
  ): Promise<string>;
};

function parseReadGroupResponse(response: unknown): RedisStreamEntry[] {
  if (!Array.isArray(response)) {
    return [];
  }

  return response.flatMap((streamEntry) => {
    if (!Array.isArray(streamEntry) || streamEntry.length < 2) {
      return [];
    }

    const [, messages] = streamEntry;
    if (!Array.isArray(messages)) {
      return [];
    }

    return messages.flatMap((message) => {
      if (!Array.isArray(message) || message.length < 2) {
        return [];
      }

      const [id, fields] = message;
      if (typeof id !== "string" || !Array.isArray(fields)) {
        return [];
      }

      const values: Record<string, string> = {};
      for (let index = 0; index < fields.length; index += 2) {
        const key = fields[index];
        const value = fields[index + 1];
        if (typeof key === "string" && typeof value === "string") {
          values[key] = value;
        }
      }

      return [{ id, values }];
    });
  });
}

async function loadRedisStreamClient(url: string): Promise<RedisStreamClient> {
  const moduleName = "ioredis";
  const redisModule = (await import(moduleName)) as {
    default?: RedisConstructor;
    Redis?: RedisConstructor;
  };
  const Redis = redisModule.default ?? redisModule.Redis;

  if (typeof Redis !== "function") {
    throw new Error(
      "The 'ioredis' package is required for Redis queue support",
    );
  }

  const client = new Redis(url);

  return {
    async ensureConsumerGroup(stream, consumerGroup) {
      try {
        await client.xgroup("CREATE", stream, consumerGroup, "$", "MKSTREAM");
      } catch (error) {
        if (!String(error).includes("BUSYGROUP")) {
          throw error;
        }
      }
    },
    async readGroup({
      stream,
      consumerGroup,
      consumerName,
      batchSize,
      blockMs,
    }) {
      const response = await client.xreadgroup(
        "GROUP",
        consumerGroup,
        consumerName,
        "COUNT",
        batchSize,
        "BLOCK",
        blockMs,
        "STREAMS",
        stream,
        ">",
      );
      return parseReadGroupResponse(response);
    },
    async ack(stream, consumerGroup, id) {
      await client.xack(stream, consumerGroup, id);
    },
    async delete(stream, id) {
      await client.xdel(stream, id);
    },
    publish(stream, payload) {
      return client.xadd(stream, "*", "payload", JSON.stringify(payload));
    },
    close() {
      return client.quit();
    },
    onClose(handler) {
      client.on("close", handler);
    },
    offClose(handler) {
      if (typeof client.off === "function") {
        client.off("close", handler);
        return;
      }
      if (typeof client.removeListener === "function") {
        client.removeListener("close", handler);
      }
    },
  };
}

function defaultReconnectScheduler(work: () => Promise<void>): void {
  setTimeout(() => {
    void work();
  }, 1000);
}

function getRedisConfig(connector: Connector): RedisQueueConfig {
  if (
    connector.type !== "queue" ||
    connector.config.type !== "queue" ||
    connector.config.provider !== "redis"
  ) {
    throw new Error("RedisQueueDriver only supports Redis queue connectors");
  }

  return connector.config;
}

function parsePayload(values: Record<string, string>): unknown {
  if (typeof values.payload === "string") {
    return JSON.parse(values.payload);
  }

  return values;
}

export class RedisQueueDriver implements QueueDriver {
  private readonly createClient: RedisClientFactory;
  private readonly scheduleReconnect: ReconnectScheduler;
  private readonly logger: Pick<Console, "error" | "info" | "warn">;

  constructor(options: RedisQueueDriverOptions = {}) {
    this.createClient = options.createClient ?? loadRedisStreamClient;
    this.scheduleReconnect =
      options.scheduleReconnect ?? defaultReconnectScheduler;
    this.logger = options.logger ?? console;
  }

  async subscribe(
    connector: Connector,
    onMessage: (message: QueueMessage) => Promise<void>,
  ): Promise<QueueSubscription> {
    const config = getRedisConfig(connector);
    const consumerName =
      config.consumerName ?? `senclaw-${connector.id.slice(0, 8)}`;
    const batchSize = config.batchSize ?? 1;
    const blockMs = config.blockMs ?? 1000;

    let closed = false;
    let recovering = false;
    let client: RedisStreamClient | undefined;
    let closeHandler: (() => void) | undefined;

    const acknowledgeAndDelete = async (
      activeClient: RedisStreamClient,
      entryId: string,
    ): Promise<void> => {
      await activeClient.ack(config.stream, config.consumerGroup, entryId);
      await activeClient.delete(config.stream, entryId);
    };

    const cleanup = async (): Promise<void> => {
      const activeClient = client;
      const activeCloseHandler = closeHandler;

      client = undefined;
      closeHandler = undefined;

      if (activeClient && activeCloseHandler && activeClient.offClose) {
        activeClient.offClose(activeCloseHandler);
      }
      if (activeClient) {
        await activeClient.close();
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
          this.logger.info?.("Recovered Redis queue subscription");
        });
      } catch (error) {
        this.logger.error?.(
          "Failed to recover Redis queue subscription",
          error,
        );
      } finally {
        recovering = false;
      }
    };

    const consumeLoop = async (
      activeClient: RedisStreamClient,
    ): Promise<void> => {
      while (!closed && client === activeClient) {
        try {
          const entries = await activeClient.readGroup({
            stream: config.stream,
            consumerGroup: config.consumerGroup,
            consumerName,
            batchSize,
            blockMs,
          });

          for (const entry of entries) {
            const payload = parsePayload(entry.values);
            const nack = async (requeue = false): Promise<void> => {
              if (requeue) {
                await activeClient.publish(config.stream, payload);
              } else if (config.deadLetterStream) {
                await activeClient.publish(config.deadLetterStream, payload);
              }
              await acknowledgeAndDelete(activeClient, entry.id);
            };

            try {
              await onMessage({
                payload,
                ack: async () => {
                  await acknowledgeAndDelete(activeClient, entry.id);
                },
                nack,
              });
            } catch (error) {
              this.logger.error?.(
                "Failed to process Redis stream entry",
                error,
              );
              await nack(config.requeueOnFailure === true);
            }
          }
        } catch (error) {
          if (closed || client !== activeClient) {
            return;
          }
          this.logger.error?.("Redis stream read failed", error);
          client = undefined;
          closeHandler = undefined;
          await recover();
          return;
        }
      }
    };

    const openSubscription = async (): Promise<void> => {
      const activeClient = await this.createClient(config.url);
      await activeClient.ensureConsumerGroup(
        config.stream,
        config.consumerGroup,
      );
      client = activeClient;
      closeHandler = () => {
        if (closed) {
          return;
        }
        if (client === activeClient) {
          client = undefined;
          closeHandler = undefined;
        }
        void recover();
      };
      activeClient.onClose(closeHandler);
      void consumeLoop(activeClient);
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
