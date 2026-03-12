import { PassThrough } from "node:stream";
import { InMemorySpanExporter } from "@opentelemetry/sdk-trace-base";
import { afterEach, describe, expect, it } from "vitest";
import {
  initializeTracing,
  shutdownTracing,
  withActiveSpan,
} from "../../observability/src/index.ts";
import {
  createChildLogger,
  createLogger,
  generateCorrelationId,
  getCorrelationId,
  mostVerboseLevel,
  resolveLogLevel,
  shouldSampleLog,
  withCorrelationId,
} from "../src/index.js";

async function readSingleLogLine(
  writeLog: (stream: PassThrough) => void | Promise<void>,
) {
  const stream = new PassThrough();
  let output = "";
  stream.on("data", (chunk) => {
    output += chunk.toString();
  });

  await writeLog(stream);
  await new Promise((resolve) => setImmediate(resolve));

  return JSON.parse(output.trim()) as Record<string, unknown>;
}

afterEach(async () => {
  await shutdownTracing();
});

describe("createLogger", () => {
  it("creates a logger with the service name", () => {
    const logger = createLogger("gateway");
    expect(logger).toBeDefined();
    expect(logger.level).toBe("info");
  });

  it("respects custom log level", () => {
    const logger = createLogger("gateway", "debug");
    expect(logger.level).toBe("debug");
  });

  it("does not log below the configured level", () => {
    const logger = createLogger("gateway", "warn");
    expect(logger.isLevelEnabled("info")).toBe(false);
    expect(logger.isLevelEnabled("warn")).toBe(true);
    expect(logger.isLevelEnabled("error")).toBe(true);
  });

  it("injects trace and span identifiers from the active span", async () => {
    const exporter = new InMemorySpanExporter();
    await initializeTracing({
      serviceName: "logging-test",
      enabled: true,
      exporter,
      autoInstrumentations: false,
    });

    const entry = await readSingleLogLine(async (stream) => {
      const logger = createLogger("gateway", "info", stream);
      await withActiveSpan(
        "logging.write",
        { tracerName: "logging-test" },
        async () => {
          logger.info({ userId: "user-1" }, "hello");
        },
      );
    });

    expect(entry.traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(entry.spanId).toMatch(/^[0-9a-f]{16}$/);
    expect(entry.userId).toBe("user-1");
  });

  it("preserves structured child bindings alongside correlation and trace context", async () => {
    const exporter = new InMemorySpanExporter();
    await initializeTracing({
      serviceName: "logging-child-test",
      enabled: true,
      exporter,
      autoInstrumentations: false,
    });

    const entry = await readSingleLogLine(async (stream) => {
      const logger = createLogger("gateway", "info", stream);
      await withActiveSpan(
        "logging.child",
        { tracerName: "logging-child-test" },
        async () => {
          await withCorrelationId("cid-123", async () => {
            const child = createChildLogger(logger, {
              agentId: "agent-1",
              runId: "run-1",
              toolName: "echo",
            });
            child.info("child log");
          });
        },
      );
    });

    expect(entry.correlationId).toBe("cid-123");
    expect(entry.traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(entry.spanId).toMatch(/^[0-9a-f]{16}$/);
    expect(entry.agentId).toBe("agent-1");
    expect(entry.runId).toBe("run-1");
    expect(entry.toolName).toBe("echo");
  });
});

describe("sampling helpers", () => {
  it("uses deterministic sampling boundaries", () => {
    expect(shouldSampleLog("request-1", 0)).toBe(false);
    expect(shouldSampleLog("request-1", 1)).toBe(true);
    expect(shouldSampleLog("request-1", 0.25)).toBe(
      shouldSampleLog("request-1", 0.25),
    );
  });

  it("prefers user and endpoint log level overrides", () => {
    expect(
      resolveLogLevel({
        defaultLevel: "info",
        endpoint: "/health",
        endpointLevels: { "/health": "debug" },
      }),
    ).toBe("debug");
    expect(
      resolveLogLevel({
        defaultLevel: "info",
        endpoint: "/health",
        userId: "system",
        endpointLevels: { "/health": "debug" },
        userLevels: { system: "trace" },
      }),
    ).toBe("trace");
  });

  it("keeps the more verbose level when merging overrides", () => {
    expect(mostVerboseLevel("info", "debug")).toBe("debug");
    expect(mostVerboseLevel("error", "debug")).toBe("debug");
  });
});

describe("correlationId", () => {
  it("returns undefined outside of a correlation context", () => {
    expect(getCorrelationId()).toBeUndefined();
  });

  it("provides the correlation ID within a withCorrelationId callback", () => {
    withCorrelationId("test-id-123", () => {
      expect(getCorrelationId()).toBe("test-id-123");
    });
  });

  it("isolates correlation IDs between concurrent contexts", async () => {
    const results: string[] = [];

    await Promise.all([
      new Promise<void>((resolve) => {
        withCorrelationId("id-a", () => {
          setTimeout(() => {
            results.push(`a:${getCorrelationId()}`);
            resolve();
          }, 10);
        });
      }),
      new Promise<void>((resolve) => {
        withCorrelationId("id-b", () => {
          setTimeout(() => {
            results.push(`b:${getCorrelationId()}`);
            resolve();
          }, 5);
        });
      }),
    ]);

    expect(results).toContain("a:id-a");
    expect(results).toContain("b:id-b");
  });

  it("cleans up after the callback completes", () => {
    withCorrelationId("temp-id", () => {
      expect(getCorrelationId()).toBe("temp-id");
    });
    expect(getCorrelationId()).toBeUndefined();
  });
});

describe("generateCorrelationId", () => {
  it("returns a unique string each time", () => {
    const id1 = generateCorrelationId();
    const id2 = generateCorrelationId();
    expect(id1).not.toBe(id2);
    expect(typeof id1).toBe("string");
    expect(id1.length).toBeGreaterThan(0);
  });
});
