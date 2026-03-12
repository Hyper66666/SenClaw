import type { Connector } from "@senclaw/protocol";
import type { EventProcessor } from "./event-processor.js";

export interface QueueMessage {
  payload: unknown;
  ack(): Promise<void> | void;
  nack(requeue?: boolean): Promise<void> | void;
}

export interface QueueSubscription {
  close(): Promise<void> | void;
}

export interface QueueDriver {
  subscribe(
    connector: Connector,
    onMessage: (message: QueueMessage) => Promise<void>,
  ): Promise<QueueSubscription>;
}

export class QueueConnector {
  private readonly subscriptions = new Map<string, QueueSubscription>();

  constructor(
    private readonly eventProcessor: Pick<EventProcessor, "processEvent">,
    private readonly driver: QueueDriver,
  ) {}

  async start(connector: Connector): Promise<QueueSubscription> {
    if (connector.type !== "queue" || connector.config.type !== "queue") {
      throw new Error("QueueConnector only supports queue connectors");
    }

    const requeueOnFailure = connector.config.requeueOnFailure === true;
    const subscription = await this.driver.subscribe(
      connector,
      async (message) => {
        try {
          await this.eventProcessor.processEvent(connector, message.payload);
          await message.ack();
        } catch {
          await message.nack(requeueOnFailure);
        }
      },
    );

    this.subscriptions.set(connector.id, subscription);
    return subscription;
  }

  async stop(connectorId?: string): Promise<void> {
    if (connectorId) {
      const subscription = this.subscriptions.get(connectorId);
      if (subscription) {
        await subscription.close();
        this.subscriptions.delete(connectorId);
      }
      return;
    }

    for (const [id, subscription] of this.subscriptions) {
      await subscription.close();
      this.subscriptions.delete(id);
    }
  }
}
