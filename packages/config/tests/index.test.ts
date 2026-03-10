import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/index.js";

describe("loadConfig", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    for (const key of Object.keys(process.env)) {
      if (key.startsWith("SENCLAW_")) {
        delete process.env[key];
      }
    }
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns defaults when no env vars are set", () => {
    const config = loadConfig();
    expect(config.logLevel).toBe("info");
    expect(config.gatewayPort).toBe(4100);
    expect(config.agentRunnerPort).toBe(4200);
    expect(config.toolRunnerPort).toBe(4400);
    expect(config.maxTurns).toBe(10);
    expect(config.llmTimeoutMs).toBe(30_000);
    expect(config.toolTimeoutMs).toBe(10_000);
    expect(config.dbUrl).toBeUndefined();
    expect(config.rateLimitAdmin).toBe(1000);
    expect(config.rateLimitUser).toBe(100);
    expect(config.rateLimitReadonly).toBe(50);
    expect(config.auditLogRetentionDays).toBe(90);
    expect(config.metricsEnabled).toBe(true);
    expect(config.tracingEnabled).toBe(false);
    expect(config.tracingEndpoint).toBeUndefined();
    expect(config.logSamplingRate).toBe(0.1);
    expect(config.logDebugEndpoints).toEqual([]);
    expect(config.logDebugUsers).toEqual([]);
  });

  it("reads values from environment variables", () => {
    process.env.SENCLAW_LOG_LEVEL = "debug";
    process.env.SENCLAW_GATEWAY_PORT = "9000";
    process.env.SENCLAW_MAX_TURNS = "5";
    process.env.SENCLAW_DB_URL = "file:./senclaw.db";
    process.env.SENCLAW_RATE_LIMIT_ADMIN = "2000";
    process.env.SENCLAW_RATE_LIMIT_USER = "250";
    process.env.SENCLAW_RATE_LIMIT_READONLY = "75";
    process.env.SENCLAW_AUDIT_LOG_RETENTION_DAYS = "30";
    process.env.SENCLAW_METRICS_ENABLED = "false";
    process.env.SENCLAW_TRACING_ENABLED = "true";
    process.env.SENCLAW_TRACING_ENDPOINT = "http://localhost:4318/v1/traces";
    process.env.SENCLAW_LOG_SAMPLING_RATE = "0.25";
    process.env.SENCLAW_LOG_DEBUG_ENDPOINTS = "/health,/metrics";
    process.env.SENCLAW_LOG_DEBUG_USERS = "system,user-1";

    const config = loadConfig();
    expect(config.logLevel).toBe("debug");
    expect(config.gatewayPort).toBe(9000);
    expect(config.maxTurns).toBe(5);
    expect(config.dbUrl).toBe("file:./senclaw.db");
    expect(config.rateLimitAdmin).toBe(2000);
    expect(config.rateLimitUser).toBe(250);
    expect(config.rateLimitReadonly).toBe(75);
    expect(config.auditLogRetentionDays).toBe(30);
    expect(config.metricsEnabled).toBe(false);
    expect(config.tracingEnabled).toBe(true);
    expect(config.tracingEndpoint).toBe("http://localhost:4318/v1/traces");
    expect(config.logSamplingRate).toBe(0.25);
    expect(config.logDebugEndpoints).toEqual(["/health", "/metrics"]);
    expect(config.logDebugUsers).toEqual(["system", "user-1"]);
  });

  it("treats an empty db url as undefined", () => {
    process.env.SENCLAW_DB_URL = "";

    const config = loadConfig();
    expect(config.dbUrl).toBeUndefined();
  });

  it("throws descriptive error for invalid values", () => {
    process.env.SENCLAW_LOG_LEVEL = "invalid-level";

    expect(() => loadConfig()).toThrow("Invalid configuration");
    expect(() => loadConfig()).toThrow("SENCLAW_LOG_LEVEL");
  });

  it("treats an empty tracing endpoint as undefined", () => {
    process.env.SENCLAW_TRACING_ENDPOINT = "";

    const config = loadConfig();
    expect(config.tracingEndpoint).toBeUndefined();
  });

  it("rejects invalid log sampling rates", () => {
    process.env.SENCLAW_LOG_SAMPLING_RATE = "2";

    expect(() => loadConfig()).toThrow("SENCLAW_LOG_SAMPLING_RATE");
  });
});
