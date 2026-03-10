import { beforeEach, describe, expect, it } from "vitest";
import {
  getMetricsRegistry,
  resetMetricsRegistry,
} from "@senclaw/observability";
import { createStorage, DatabaseHealthCheck } from "../src/index.js";

describe("SqliteAgentRepository", () => {
  beforeEach(() => {
    resetMetricsRegistry();
  });

  it("creates, gets, lists, and deletes agents", async () => {
    const storage = createStorage(":memory:");

    const agent = await storage.agents.create({
      name: "SQLite Agent",
      systemPrompt: "Be helpful",
      provider: { provider: "openai", model: "gpt-4o" },
      tools: ["echo"],
    });

    expect(agent.id).toBeDefined();
    await expect(storage.agents.get(agent.id)).resolves.toEqual(agent);
    await expect(storage.agents.list()).resolves.toHaveLength(1);
    await expect(storage.agents.delete(agent.id)).resolves.toBe(true);
    await expect(storage.agents.get(agent.id)).resolves.toBeUndefined();
  });

  it("records database query metrics", async () => {
    const storage = createStorage(":memory:");

    const agent = await storage.agents.create({
      name: "Observed Agent",
      systemPrompt: "Observe queries",
      provider: { provider: "openai", model: "gpt-4o" },
      tools: [],
    });
    await storage.agents.get(agent.id);
    await storage.agents.list();
    await storage.agents.delete(agent.id);

    const output = await getMetricsRegistry().metrics();
    expect(output).toContain("db_query_duration_seconds_bucket");
    expect(output).toContain('operation="insert"');
    expect(output).toContain('operation="select"');
    expect(output).toContain('operation="delete"');
  });
});

describe("SqliteRunRepository", () => {
  it("creates and updates runs", async () => {
    const storage = createStorage(":memory:");

    const run = await storage.runs.create("agent-1", "Hello");
    expect(run.status).toBe("pending");

    const running = await storage.runs.updateStatus(run.id, "running");
    expect(running?.status).toBe("running");

    const failed = await storage.runs.updateStatus(run.id, "failed", "Timeout");
    expect(failed?.status).toBe("failed");
    expect(failed?.error).toBe("Timeout");
  });
});

describe("SqliteMessageRepository", () => {
  it("appends and lists messages in order", async () => {
    const storage = createStorage(":memory:");

    await storage.messages.append("run-1", {
      role: "system",
      content: "You are helpful",
    });
    await storage.messages.append("run-1", { role: "user", content: "Hello" });
    await storage.messages.append("run-1", {
      role: "assistant",
      toolCalls: [
        {
          toolCallId: "call-1",
          toolName: "echo",
          args: { text: "Hello" },
        },
      ],
    });

    const messages = await storage.messages.listByRunId("run-1");
    expect(messages).toHaveLength(3);
    expect(messages[0].role).toBe("system");
    expect(messages[1].role).toBe("user");
    expect(messages[2]).toMatchObject({ role: "assistant" });
  });
});

describe("DatabaseHealthCheck", () => {
  it("returns healthy for a reachable database", async () => {
    const storage = createStorage(":memory:");
    await expect(storage.healthCheck.check()).resolves.toEqual({
      status: "healthy",
    });
  });

  it("returns unhealthy when the query throws", async () => {
    const check = new DatabaseHealthCheck(() => {
      throw new Error("boom");
    });

    await expect(check.check()).resolves.toEqual({
      status: "unhealthy",
      detail: "boom",
    });
  });
});
