import { PassThrough } from "node:stream";
import { InMemorySpanExporter } from "@opentelemetry/sdk-trace-base";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "../src/server.js";

async function waitForFinishedSpans(
  exporter: InMemorySpanExporter,
  expectedCount: number,
) {
  const deadline = Date.now() + 1_000;
  while (Date.now() < deadline) {
    const spans = exporter.getFinishedSpans();
    if (spans.length >= expectedCount) {
      return spans;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  return exporter.getFinishedSpans();
}

describe("Gateway API", () => {
  let app: FastifyInstance;
  let adminKey = "";

  const authHeaders = () => ({ authorization: `Bearer ${adminKey}` });

  beforeAll(async () => {
    const server = await createServer();
    app = server.app;
    adminKey = server.bootstrapAdminKey ?? "";
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe("GET /health", () => {
    it("returns healthy status without storage details by default", async () => {
      const response = await app.inject({ method: "GET", url: "/health" });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.status).toBe("healthy");
      expect(body.details).toMatchObject({
        gateway: { status: "healthy" },
      });
      expect(body.details?.storage).toBeUndefined();
    });
  });

  describe("GET /metrics", () => {
    it("returns Prometheus text without requiring authentication", async () => {
      await app.inject({ method: "GET", url: "/health" });

      const response = await app.inject({
        method: "GET",
        url: "/metrics",
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toContain("text/plain");
      expect(response.body).toContain("http_requests_total");
      expect(response.body).toContain(
        'http_requests_total{method="GET",path="/health",status="200"}',
      );
    });
  });

  describe("POST /api/v1/agents", () => {
    it("creates an agent and returns 201", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/agents",
        headers: authHeaders(),
        payload: {
          name: "Test Agent",
          systemPrompt: "You are helpful",
          provider: { provider: "openai", model: "gpt-4o" },
          tools: ["echo"],
        },
      });
      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.id).toBeDefined();
      expect(body.name).toBe("Test Agent");
    });

    it("returns 400 for invalid body", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/agents",
        headers: authHeaders(),
        payload: { name: "Test" },
      });
      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.error).toBe("VALIDATION_ERROR");
    });
  });

  describe("GET /api/v1/agents", () => {
    it("lists agents", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/agents",
        headers: authHeaders(),
      });
      expect(response.statusCode).toBe(200);
      expect(Array.isArray(response.json())).toBe(true);
    });
  });

  describe("GET /api/v1/agents/:id", () => {
    it("returns 404 for unknown id", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/agents/nonexistent",
        headers: authHeaders(),
      });
      expect(response.statusCode).toBe(404);
    });

    it("returns agent by id", async () => {
      const createRes = await app.inject({
        method: "POST",
        url: "/api/v1/agents",
        headers: authHeaders(),
        payload: {
          name: "Find Me",
          systemPrompt: "Hello",
          provider: { provider: "openai", model: "gpt-4o" },
        },
      });
      const agent = createRes.json();

      const response = await app.inject({
        method: "GET",
        url: `/api/v1/agents/${agent.id}`,
        headers: authHeaders(),
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().name).toBe("Find Me");
    });
  });

  describe("DELETE /api/v1/agents/:id", () => {
    it("deletes an agent and returns 204", async () => {
      const createRes = await app.inject({
        method: "POST",
        url: "/api/v1/agents",
        headers: authHeaders(),
        payload: {
          name: "Delete Me",
          systemPrompt: "Bye",
          provider: { provider: "openai", model: "gpt-4o" },
        },
      });
      const agent = createRes.json();

      const response = await app.inject({
        method: "DELETE",
        url: `/api/v1/agents/${agent.id}`,
        headers: authHeaders(),
      });
      expect(response.statusCode).toBe(204);

      const getRes = await app.inject({
        method: "GET",
        url: `/api/v1/agents/${agent.id}`,
        headers: authHeaders(),
      });
      expect(getRes.statusCode).toBe(404);
    });
  });

  describe("POST /api/v1/tasks", () => {
    it("returns 404 for non-existent agent", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/tasks",
        headers: authHeaders(),
        payload: { agentId: "no-such-agent", input: "Hello" },
      });
      expect(response.statusCode).toBe(404);
    });

    it("returns 400 for invalid body", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/tasks",
        headers: authHeaders(),
        payload: {},
      });
      expect(response.statusCode).toBe(400);
    });

    it("creates a run for a valid task", async () => {
      const agentRes = await app.inject({
        method: "POST",
        url: "/api/v1/agents",
        headers: authHeaders(),
        payload: {
          name: "Task Agent",
          systemPrompt: "Be helpful",
          provider: { provider: "test-provider", model: "test" },
          tools: [],
        },
      });
      const agent = agentRes.json();

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/tasks",
        headers: authHeaders(),
        payload: { agentId: agent.id, input: "Hello" },
      });
      expect(response.statusCode).toBe(201);
      const run = response.json();
      expect(run.id).toBeDefined();
      expect(run.status).toBe("pending");
    });
  });

  describe("GET /api/v1/runs/:id", () => {
    it("returns 404 for unknown run", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/runs/nonexistent",
        headers: authHeaders(),
      });
      expect(response.statusCode).toBe(404);
    });
  });

  describe("GET /api/v1/runs", () => {
    it("lists submitted runs", async () => {
      const agentRes = await app.inject({
        method: "POST",
        url: "/api/v1/agents",
        headers: authHeaders(),
        payload: {
          name: "Runs Agent",
          systemPrompt: "Track runs",
          provider: { provider: "test-provider", model: "test" },
          tools: [],
        },
      });
      const agent = agentRes.json();

      const runRes = await app.inject({
        method: "POST",
        url: "/api/v1/tasks",
        headers: authHeaders(),
        payload: { agentId: agent.id, input: "List me" },
      });
      const run = runRes.json();

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/runs",
        headers: authHeaders(),
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: run.id,
            agentId: agent.id,
            input: "List me",
          }),
        ]),
      );
    });
  });

  describe("Correlation ID", () => {
    it("returns x-correlation-id header", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/health",
      });
      expect(response.headers["x-correlation-id"]).toBeDefined();
    });

    it("propagates client-supplied correlation id", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/health",
        headers: { "x-correlation-id": "my-test-id" },
      });
      expect(response.headers["x-correlation-id"]).toBe("my-test-id");
    });
  });
});

describe("Gateway API with SQLite storage", () => {
  it("includes storage health details when SENCLAW_DB_URL is set", async () => {
    const { mkdtempSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");

    const previousDbUrl = process.env.SENCLAW_DB_URL;
    const tempDir = mkdtempSync(join(tmpdir(), "senclaw-gateway-health-"));
    const dbPath = join(tempDir, "health.db");
    process.env.SENCLAW_DB_URL = `file:${dbPath}`;

    const server = await createServer();
    const sqliteApp = server.app;
    const adminHeaders = {
      authorization: `Bearer ${server.bootstrapAdminKey}`,
    };
    await sqliteApp.ready();

    try {
      const response = await sqliteApp.inject({
        method: "GET",
        url: "/health",
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        status: "healthy",
        details: {
          gateway: { status: "healthy" },
          storage: { status: "healthy" },
        },
      });

      const authResponse = await sqliteApp.inject({
        method: "GET",
        url: "/api/v1/agents",
        headers: adminHeaders,
      });
      expect(authResponse.statusCode).toBe(200);
    } finally {
      await sqliteApp.close();
      rmSync(tempDir, { recursive: true, force: true });
      if (previousDbUrl === undefined) {
        process.env.SENCLAW_DB_URL = undefined;
      } else {
        process.env.SENCLAW_DB_URL = previousDbUrl;
      }
    }
  });

  it("persists agents across server restarts when SENCLAW_DB_URL is set", async () => {
    const { mkdtempSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");

    const previousDbUrl = process.env.SENCLAW_DB_URL;
    const tempDir = mkdtempSync(join(tmpdir(), "senclaw-gateway-persist-"));
    const dbPath = join(tempDir, "persist.db");
    process.env.SENCLAW_DB_URL = `file:${dbPath}`;

    const firstServer = await createServer();
    const firstApp = firstServer.app;
    const adminKey = firstServer.bootstrapAdminKey ?? "";
    await firstApp.ready();

    let createdAgentId = "";

    try {
      const createResponse = await firstApp.inject({
        method: "POST",
        url: "/api/v1/agents",
        headers: { authorization: `Bearer ${adminKey}` },
        payload: {
          name: "Persistent Agent",
          systemPrompt: "Remember me",
          provider: { provider: "openai", model: "gpt-4o" },
          tools: [],
        },
      });

      expect(createResponse.statusCode).toBe(201);
      createdAgentId = createResponse.json().id;
    } finally {
      await firstApp.close();
    }

    const secondServer = await createServer();
    const secondApp = secondServer.app;
    await secondApp.ready();

    try {
      const listResponse = await secondApp.inject({
        method: "GET",
        url: "/api/v1/agents",
        headers: { authorization: `Bearer ${adminKey}` },
      });
      expect(listResponse.statusCode).toBe(200);
      expect(listResponse.json()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: createdAgentId,
            name: "Persistent Agent",
          }),
        ]),
      );
    } finally {
      await secondApp.close();
      rmSync(tempDir, { recursive: true, force: true });
      if (previousDbUrl === undefined) {
        process.env.SENCLAW_DB_URL = undefined;
      } else {
        process.env.SENCLAW_DB_URL = previousDbUrl;
      }
    }
  });
});

describe("Gateway metrics configuration", () => {
  const originalEnv = { ...process.env };

  afterAll(() => {
    process.env = originalEnv;
  });

  it("does not expose /metrics when SENCLAW_METRICS_ENABLED=false", async () => {
    process.env.SENCLAW_METRICS_ENABLED = "false";

    const server = await createServer();
    const app = server.app;
    await app.ready();

    try {
      const response = await app.inject({
        method: "GET",
        url: "/metrics",
      });

      expect(response.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });
});

describe("Gateway tracing", () => {
  const originalEnv = { ...process.env };

  afterAll(() => {
    process.env = originalEnv;
  });

  it("exports a request span and preserves the incoming trace id", async () => {
    process.env.SENCLAW_TRACING_ENABLED = "true";

    const exporter = new InMemorySpanExporter();
    const server = await createServer({
      tracingExporter: exporter,
      autoInstrumentations: false,
    });
    const app = server.app;
    await app.ready();

    try {
      const response = await app.inject({
        method: "GET",
        url: "/health",
        headers: {
          traceparent:
            "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
        },
      });

      expect(response.statusCode).toBe(200);

      const spans = await waitForFinishedSpans(exporter, 1);
      expect(
        spans.some(
          (span) =>
            span.name === "GET /health" &&
            span.spanContext().traceId === "4bf92f3577b34da6a3ce929d0e0e4736",
        ),
      ).toBe(true);
    } finally {
      await app.close();
    }
  });
});

describe("Gateway request logging", () => {
  const originalEnv = { ...process.env };

  afterAll(() => {
    process.env = originalEnv;
  });

  it("allows endpoint debug overrides to bypass high-volume sampling", async () => {
    process.env.SENCLAW_LOG_SAMPLING_RATE = "0";
    process.env.SENCLAW_LOG_DEBUG_ENDPOINTS = "/health";

    const stream = new PassThrough();
    let output = "";
    stream.on("data", (chunk) => {
      output += chunk.toString();
    });

    const server = await createServer({ loggerDestination: stream });
    const app = server.app;
    await app.ready();

    try {
      const response = await app.inject({ method: "GET", url: "/health" });
      expect(response.statusCode).toBe(200);
      await new Promise((resolve) => setImmediate(resolve));

      const lines = output
        .trim()
        .split("\n")
        .filter((line) => line.length > 0);
      expect(lines).toHaveLength(1);
      expect(JSON.parse(lines[0])).toMatchObject({
        level: 20,
        path: "/health",
        method: "GET",
        statusCode: 200,
      });
    } finally {
      await app.close();
    }
  });
});
