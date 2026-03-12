import { describe, expect, it, vi } from "vitest";
import type { Connector } from "@senclaw/protocol";
import { EventProcessor } from "../src/event-processor.js";

const connector: Connector = {
  id: "connector-1",
  name: "webhook-events",
  type: "webhook",
  agentId: "agent-1",
  config: {
    type: "webhook",
    secret: "secret",
  },
  transformation: {
    jsonPath: "$.message",
  },
  enabled: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe("EventProcessor", () => {
  it("retries transient submission failures with exponential backoff", async () => {
    const retryDelays: number[] = [];
    const submitTask = vi
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error("temporary outage"), { code: "ECONNRESET" }),
      )
      .mockResolvedValueOnce({ id: "run-1" });
    const eventRepo = {
      create: vi.fn(async (data) => ({ ...data })),
      update: vi.fn(async () => undefined),
    };
    const processor = new EventProcessor(
      { submitTask },
      eventRepo as never,
      {
        retryPolicy: {
          maxRetries: 2,
          initialDelayMs: 10,
          maxDelayMs: 100,
          backoffMultiplier: 2,
          schedule: async (work, delayMs) => {
            retryDelays.push(delayMs);
            await work();
          },
        },
      },
    );

    await processor.processEvent(connector, { message: "hello" });

    expect(submitTask).toHaveBeenCalledTimes(2);
    expect(retryDelays).toEqual([10]);
    expect(eventRepo.create).toHaveBeenCalledTimes(2);
    expect(eventRepo.update).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.objectContaining({
        status: "submitted",
        runId: "run-1",
      }),
    );
  });

  it("does not retry non-retryable validation failures", async () => {
    const schedule = vi.fn();
    const submitTask = vi.fn().mockRejectedValueOnce(
      Object.assign(new Error("bad request"), { statusCode: 400 }),
    );
    const eventRepo = {
      create: vi.fn(async (data) => ({ ...data })),
      update: vi.fn(async () => undefined),
    };
    const processor = new EventProcessor(
      { submitTask },
      eventRepo as never,
      {
        retryPolicy: {
          maxRetries: 2,
          schedule,
        },
      },
    );

    await expect(
      processor.processEvent(connector, { message: "hello" }),
    ).rejects.toThrow("bad request");

    expect(submitTask).toHaveBeenCalledTimes(1);
    expect(schedule).not.toHaveBeenCalled();
  });
});
