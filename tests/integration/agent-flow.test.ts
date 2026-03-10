import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "../../apps/gateway/src/server";

describe("Agent end-to-end flow", () => {
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

  it("creates an agent, submits a task, and retrieves the run", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v1/agents",
      headers: authHeaders(),
      payload: {
        name: "Integration Test Agent",
        systemPrompt: "You are helpful",
        provider: { provider: "test-provider", model: "test-model" },
        tools: [],
      },
    });
    expect(createRes.statusCode).toBe(201);
    const agent = createRes.json();
    expect(agent.id).toBeDefined();

    const taskRes = await app.inject({
      method: "POST",
      url: "/api/v1/tasks",
      headers: authHeaders(),
      payload: { agentId: agent.id, input: "Hello" },
    });
    expect(taskRes.statusCode).toBe(201);
    const run = taskRes.json();
    expect(run.id).toBeDefined();
    expect(run.status).toBe("pending");
    expect(run.agentId).toBe(agent.id);

    const runRes = await app.inject({
      method: "GET",
      url: `/api/v1/runs/${run.id}`,
      headers: authHeaders(),
    });
    expect(runRes.statusCode).toBe(200);
    const fetchedRun = runRes.json();
    expect(fetchedRun.id).toBe(run.id);

    const msgRes = await app.inject({
      method: "GET",
      url: `/api/v1/runs/${run.id}/messages`,
      headers: authHeaders(),
    });
    expect(msgRes.statusCode).toBe(200);
    const messages = msgRes.json();
    expect(Array.isArray(messages)).toBe(true);
  });

  it("full CRUD lifecycle for agents", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v1/agents",
      headers: authHeaders(),
      payload: {
        name: "CRUD Agent",
        systemPrompt: "Test",
        provider: { provider: "openai", model: "gpt-4o" },
      },
    });
    const agent = createRes.json();

    const listRes = await app.inject({
      method: "GET",
      url: "/api/v1/agents",
      headers: authHeaders(),
    });
    const agents = listRes.json();
    expect(agents.some((a: { id: string }) => a.id === agent.id)).toBe(true);

    const getRes = await app.inject({
      method: "GET",
      url: `/api/v1/agents/${agent.id}`,
      headers: authHeaders(),
    });
    expect(getRes.statusCode).toBe(200);
    expect(getRes.json().name).toBe("CRUD Agent");

    const deleteRes = await app.inject({
      method: "DELETE",
      url: `/api/v1/agents/${agent.id}`,
      headers: authHeaders(),
    });
    expect(deleteRes.statusCode).toBe(204);

    const gone = await app.inject({
      method: "GET",
      url: `/api/v1/agents/${agent.id}`,
      headers: authHeaders(),
    });
    expect(gone.statusCode).toBe(404);
  });

  it("returns proper error for task with non-existent agent", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tasks",
      headers: authHeaders(),
      payload: { agentId: "does-not-exist", input: "Hello" },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe("NOT_FOUND");
  });

  it("returns proper validation error for invalid request", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/agents",
      headers: authHeaders(),
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("VALIDATION_ERROR");
  });

  it("health check returns healthy", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/health",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("healthy");
  });
});
