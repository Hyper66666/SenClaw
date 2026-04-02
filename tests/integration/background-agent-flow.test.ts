import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "../../apps/gateway/src/server";

async function waitFor<T>(
  getValue: () => Promise<T>,
  predicate: (value: T) => boolean,
): Promise<T> {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    const value = await getValue();
    if (predicate(value)) {
      return value;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return getValue();
}

describe("Background agent API flow", () => {
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

  it("creates a background task and triggers a new run when a follow-up message arrives", async () => {
    const agentRes = await app.inject({
      method: "POST",
      url: "/api/v1/agents",
      headers: authHeaders(),
      payload: {
        name: "Background Integration Agent",
        systemPrompt: "Be helpful",
        provider: { provider: "test-provider", model: "test-model" },
        tools: [],
        background: true,
      },
    });
    expect(agentRes.statusCode).toBe(201);
    const agent = agentRes.json();

    const taskRes = await app.inject({
      method: "POST",
      url: "/api/v1/agent-tasks/background",
      headers: authHeaders(),
      payload: {
        agentId: agent.id,
        input: "Initial background step",
      },
    });
    expect(taskRes.statusCode).toBe(201);
    const task = taskRes.json();

    const settledTask = await waitFor(
      async () => {
        const response = await app.inject({
          method: "GET",
          url: `/api/v1/agent-tasks/${task.id}`,
          headers: authHeaders(),
        });
        return response.json();
      },
      (value) => ["completed", "failed"].includes(value.status),
    );
    expect(["completed", "failed"]).toContain(settledTask.status);

    const followUpRes = await app.inject({
      method: "POST",
      url: `/api/v1/agent-tasks/${task.id}/messages`,
      headers: authHeaders(),
      payload: {
        content: "Continue with the second half",
      },
    });
    expect(followUpRes.statusCode).toBe(202);

    const runs = await waitFor(
      async () => {
        const response = await app.inject({
          method: "GET",
          url: "/api/v1/runs",
          headers: authHeaders(),
        });
        return response.json();
      },
      (value) =>
        Array.isArray(value) &&
        value.filter((run) => run.agentTaskId === task.id).length >= 2,
    );
    expect(runs.filter((run) => run.agentTaskId === task.id)).toHaveLength(2);

    const messages = await waitFor(
      async () => {
        const response = await app.inject({
          method: "GET",
          url: `/api/v1/agent-tasks/${task.id}/messages`,
          headers: authHeaders(),
        });
        return response.json();
      },
      (value) =>
        Array.isArray(value) &&
        value.filter(
          (message) =>
            message.role === "user" &&
            (message.content === "Initial background step" ||
              message.content === "Continue with the second half"),
        ).length >= 2,
    );

    expect(messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: "user",
          content: "Initial background step",
        }),
        expect.objectContaining({
          role: "user",
          content: "Continue with the second half",
        }),
      ]),
    );
  });
});
