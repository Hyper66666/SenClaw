import { describe, expect, it, vi } from "vitest";
import type { Connector } from "@senclaw/protocol";
import { PollingConnector } from "../src/polling-connector.js";

function createResponse(
  body: string,
  headers: Record<string, string> = {},
  status = 200,
) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name: string) {
        return headers[name.toLowerCase()] ?? null;
      },
    },
    text: async () => body,
  };
}

const etagConnector: Connector = {
  id: "connector-poll-1",
  name: "poll-events",
  type: "polling",
  agentId: "agent-1",
  config: {
    type: "polling",
    provider: "http",
    url: "https://example.com/events",
    interval: 60,
    changeDetection: "etag",
  },
  transformation: {},
  enabled: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const hashConnector: Connector = {
  ...etagConnector,
  id: "connector-poll-2",
  config: {
    type: "polling",
    provider: "http",
    url: "https://example.com/updates",
    interval: 60,
    changeDetection: "content-hash",
  },
};

describe("PollingConnector", () => {
  it("processes changed responses and skips matching etags", async () => {
    const eventProcessor = {
      processEvent: vi.fn(async () => undefined),
    };
    const fetcher = {
      fetch: vi
        .fn()
        .mockResolvedValueOnce(
          createResponse('{"message":"hello"}', {
            etag: '"v1"',
            "content-type": "application/json",
          }),
        )
        .mockResolvedValueOnce(
          createResponse('{"message":"hello"}', {
            etag: '"v1"',
            "content-type": "application/json",
          }),
        ),
    };
    const pollingConnector = new PollingConnector(
      eventProcessor as never,
      fetcher as never,
    );

    await expect(pollingConnector.poll(etagConnector)).resolves.toBe(true);
    await expect(pollingConnector.poll(etagConnector)).resolves.toBe(false);

    expect(eventProcessor.processEvent).toHaveBeenCalledTimes(1);
    expect(eventProcessor.processEvent).toHaveBeenCalledWith(etagConnector, {
      message: "hello",
    });
  });

  it("uses content hashes when no cache validators are available", async () => {
    const eventProcessor = {
      processEvent: vi.fn(async () => undefined),
    };
    const fetcher = {
      fetch: vi
        .fn()
        .mockResolvedValueOnce(
          createResponse('{"message":"hello"}', {
            "content-type": "application/json",
          }),
        )
        .mockResolvedValueOnce(
          createResponse('{"message":"hello"}', {
            "content-type": "application/json",
          }),
        )
        .mockResolvedValueOnce(
          createResponse('{"message":"changed"}', {
            "content-type": "application/json",
          }),
        ),
    };
    const pollingConnector = new PollingConnector(
      eventProcessor as never,
      fetcher as never,
    );

    await expect(pollingConnector.poll(hashConnector)).resolves.toBe(true);
    await expect(pollingConnector.poll(hashConnector)).resolves.toBe(false);
    await expect(pollingConnector.poll(hashConnector)).resolves.toBe(true);

    expect(eventProcessor.processEvent).toHaveBeenCalledTimes(2);
    expect(eventProcessor.processEvent).toHaveBeenLastCalledWith(
      hashConnector,
      {
        message: "changed",
      },
    );
  });
});
