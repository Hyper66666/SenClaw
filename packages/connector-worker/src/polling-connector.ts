import { createHash } from "node:crypto";
import type { Connector, PollingConfig } from "@senclaw/protocol";
import type { EventProcessor } from "./event-processor.js";

export interface PollingResponse {
  ok: boolean;
  status: number;
  headers: {
    get(name: string): string | null;
  };
  text(): Promise<string>;
}

export interface PollingFetcher {
  fetch(
    url: string,
    init?: {
      method?: string;
      headers?: Record<string, string>;
    },
  ): Promise<PollingResponse>;
}

interface PollingState {
  etag?: string;
  lastModified?: string;
  contentHash?: string;
}

const defaultFetcher: PollingFetcher = {
  fetch: (url, init) =>
    fetch(url, init as RequestInit) as Promise<PollingResponse>,
};

function parseBody(body: string, contentType: string | null): unknown {
  const trimmed = body.trim();
  const shouldParseJson =
    (contentType?.includes("json") ?? false) ||
    trimmed.startsWith("{") ||
    trimmed.startsWith("[");

  if (!shouldParseJson) {
    return body;
  }

  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}

export class PollingConnector {
  private readonly states = new Map<string, PollingState>();
  private readonly timers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly eventProcessor: Pick<EventProcessor, "processEvent">,
    private readonly fetcher: PollingFetcher = defaultFetcher,
  ) {}

  async poll(connector: Connector): Promise<boolean> {
    if (connector.type !== "polling") {
      throw new Error("PollingConnector only supports polling connectors");
    }

    const config = connector.config as PollingConfig;
    const response = await this.fetcher.fetch(config.url, {
      method: config.method ?? "GET",
      headers: config.headers,
    });

    if (!response.ok) {
      throw new Error(`Polling request failed with status ${response.status}`);
    }

    const body = await response.text();
    const strategy = config.changeDetection ?? "content-hash";
    const nextState = this.buildState(response, body);
    const previousState = this.states.get(connector.id);

    if (this.isUnchanged(strategy, previousState, nextState)) {
      return false;
    }

    const payload = parseBody(body, response.headers.get("content-type"));
    await this.eventProcessor.processEvent(connector, payload);
    this.states.set(connector.id, nextState);

    return true;
  }

  start(connector: Connector): void {
    if (connector.type !== "polling") {
      throw new Error("PollingConnector only supports polling connectors");
    }

    if (this.timers.has(connector.id)) {
      return;
    }

    const config = connector.config as PollingConfig;
    const timer = setInterval(() => {
      void this.poll(connector);
    }, config.interval * 1_000);

    this.timers.set(connector.id, timer);
  }

  stop(connectorId?: string): void {
    if (connectorId) {
      const timer = this.timers.get(connectorId);
      if (timer) {
        clearInterval(timer);
        this.timers.delete(connectorId);
      }
      return;
    }

    for (const [id, timer] of this.timers) {
      clearInterval(timer);
      this.timers.delete(id);
    }
  }

  private buildState(response: PollingResponse, body: string): PollingState {
    return {
      etag: response.headers.get("etag") ?? undefined,
      lastModified: response.headers.get("last-modified") ?? undefined,
      contentHash: createHash("sha256").update(body).digest("hex"),
    };
  }

  private isUnchanged(
    strategy: NonNullable<PollingConfig["changeDetection"]> | "content-hash",
    previousState: PollingState | undefined,
    nextState: PollingState,
  ): boolean {
    if (!previousState) {
      return false;
    }

    if (strategy === "etag" && nextState.etag) {
      return previousState.etag === nextState.etag;
    }

    if (strategy === "last-modified" && nextState.lastModified) {
      return previousState.lastModified === nextState.lastModified;
    }

    return previousState.contentHash === nextState.contentHash;
  }
}
