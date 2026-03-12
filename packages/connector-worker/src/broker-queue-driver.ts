import type { Connector } from "@senclaw/protocol";
import { RabbitMqQueueDriver } from "./rabbitmq-queue-driver.js";
import { RedisQueueDriver } from "./redis-queue-driver.js";
import type {
  QueueDriver,
  QueueMessage,
  QueueSubscription,
} from "./queue-connector.js";

export interface BrokerQueueDriverOptions {
  rabbitmq?: QueueDriver;
  redis?: QueueDriver;
}

export class BrokerQueueDriver implements QueueDriver {
  private readonly rabbitmq: QueueDriver;
  private readonly redis: QueueDriver;

  constructor(options: BrokerQueueDriverOptions = {}) {
    this.rabbitmq = options.rabbitmq ?? new RabbitMqQueueDriver();
    this.redis = options.redis ?? new RedisQueueDriver();
  }

  subscribe(
    connector: Connector,
    onMessage: (message: QueueMessage) => Promise<void>,
  ): Promise<QueueSubscription> {
    if (connector.type !== "queue" || connector.config.type !== "queue") {
      throw new Error("BrokerQueueDriver only supports queue connectors");
    }

    if (connector.config.provider === "rabbitmq") {
      return this.rabbitmq.subscribe(connector, onMessage);
    }

    if (connector.config.provider === "redis") {
      return this.redis.subscribe(connector, onMessage);
    }

    throw new Error("Unsupported queue provider");
  }
}
