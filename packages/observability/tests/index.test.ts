import { describe, expect, it, beforeEach } from "vitest";
import {
  MetricsRegistry,
  InMemoryMetrics,
  type HealthCheck,
  type HealthCheckResult,
} from "../src/index.js";

describe("HealthCheck interface", () => {
  it("supports a healthy check", () => {
    const check: HealthCheck = {
      check: () => ({ status: "healthy" }),
    };
    const result = check.check() as HealthCheckResult;
    expect(result.status).toBe("healthy");
  });

  it("supports a degraded check with detail", () => {
    const check: HealthCheck = {
      check: () => ({ status: "degraded", detail: "High memory usage" }),
    };
    const result = check.check() as HealthCheckResult;
    expect(result.status).toBe("degraded");
    expect(result.detail).toBe("High memory usage");
  });

  it("supports an async check", async () => {
    const check: HealthCheck = {
      check: async () => ({ status: "unhealthy", detail: "DB down" }),
    };
    const result = await check.check();
    expect(result.status).toBe("unhealthy");
  });
});

describe("InMemoryMetrics", () => {
  let metrics: InMemoryMetrics;

  beforeEach(() => {
    metrics = new InMemoryMetrics();
  });

  it("increments a counter", () => {
    metrics.increment("requests_total", { route: "/api/v1/agents" });
    metrics.increment("requests_total", { route: "/api/v1/agents" });
    expect(
      metrics.getCounter("requests_total", { route: "/api/v1/agents" }),
    ).toBe(2);
  });

  it("tracks counters with different labels independently", () => {
    metrics.increment("requests_total", { route: "/agents" });
    metrics.increment("requests_total", { route: "/tasks" });
    expect(metrics.getCounter("requests_total", { route: "/agents" })).toBe(1);
    expect(metrics.getCounter("requests_total", { route: "/tasks" })).toBe(1);
  });

  it("records histogram observations", () => {
    metrics.observe("request_duration_ms", 42, { route: "/api/v1/tasks" });
    metrics.observe("request_duration_ms", 58, { route: "/api/v1/tasks" });
    const obs = metrics.getObservations("request_duration_ms", {
      route: "/api/v1/tasks",
    });
    expect(obs).toEqual([42, 58]);
  });

  it("returns 0 for unknown counter", () => {
    expect(metrics.getCounter("unknown")).toBe(0);
  });

  it("returns empty array for unknown observations", () => {
    expect(metrics.getObservations("unknown")).toEqual([]);
  });

  it("resets all data", () => {
    metrics.increment("a");
    metrics.observe("b", 1);
    metrics.reset();
    expect(metrics.getCounter("a")).toBe(0);
    expect(metrics.getObservations("b")).toEqual([]);
  });
});

describe("MetricsRegistry", () => {
  let metrics: MetricsRegistry;

  beforeEach(() => {
    metrics = new MetricsRegistry();
  });

  it("records HTTP request counters and histograms in Prometheus format", async () => {
    metrics.recordHttpRequest({
      method: "GET",
      path: "/health",
      status: "200",
      durationSeconds: 0.042,
    });

    const output = await metrics.metrics();
    expect(output).toContain("http_requests_total");
    expect(output).toContain(
      'http_requests_total{method="GET",path="/health",status="200"} 1',
    );
    expect(output).toContain("http_request_duration_seconds_bucket");
  });

  it("records agent, tool, and database metrics", async () => {
    metrics.recordAgentExecution({
      agentId: "agent-1",
      status: "success",
      durationSeconds: 1.2,
    });
    metrics.recordToolCall({
      toolName: "echo",
      status: "failed",
      durationSeconds: 0.01,
    });
    metrics.recordDatabaseQuery({
      operation: "select",
      durationSeconds: 0.003,
    });

    const output = await metrics.metrics();
    expect(output).toContain("agent_executions_total");
    expect(output).toContain(
      'tool_calls_total{tool_name="echo",status="failed"} 1',
    );
    expect(output).toContain("db_query_duration_seconds_bucket");
    expect(output).toContain('operation="select"');
  });
});
