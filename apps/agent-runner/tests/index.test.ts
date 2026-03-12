import {
  getMetricsRegistry,
  resetMetricsRegistry,
} from "@senclaw/observability";
import { ToolRegistry, registerBuiltinTools } from "@senclaw/tool-runner-host";
import { beforeEach, describe, expect, it } from "vitest";
import { AgentService } from "../src/agent-service.js";
import { executeRun } from "../src/execution-loop.js";
import {
  InMemoryAgentRepository,
  InMemoryMessageRepository,
  InMemoryRunRepository,
} from "../src/repositories.js";

describe("InMemoryAgentRepository", () => {
  let repo: InMemoryAgentRepository;

  beforeEach(() => {
    repo = new InMemoryAgentRepository();
  });

  it("creates an agent with a generated id", async () => {
    const created = repo.create({
      name: "Test",
      systemPrompt: "Be helpful",
      provider: { provider: "openai", model: "gpt-4o" },
      tools: [],
    });

    expect(created).toBeInstanceOf(Promise);

    const agent = await created;
    expect(agent.id).toBeDefined();
    expect(agent.name).toBe("Test");
  });

  it("retrieves an agent by id", async () => {
    const created = await repo.create({
      name: "Test",
      systemPrompt: "Be helpful",
      provider: { provider: "openai", model: "gpt-4o" },
      tools: [],
    });
    const found = await repo.get(created.id);
    expect(found).toEqual(created);
  });

  it("returns undefined for unknown id", async () => {
    await expect(repo.get("unknown")).resolves.toBeUndefined();
  });

  it("lists all agents", async () => {
    await repo.create({
      name: "A",
      systemPrompt: "X",
      provider: { provider: "openai", model: "m" },
      tools: [],
    });
    await repo.create({
      name: "B",
      systemPrompt: "Y",
      provider: { provider: "openai", model: "m" },
      tools: [],
    });
    await expect(repo.list()).resolves.toHaveLength(2);
  });

  it("deletes an agent", async () => {
    const agent = await repo.create({
      name: "Test",
      systemPrompt: "Be helpful",
      provider: { provider: "openai", model: "gpt-4o" },
      tools: [],
    });
    await expect(repo.delete(agent.id)).resolves.toBe(true);
    await expect(repo.get(agent.id)).resolves.toBeUndefined();
  });
});

describe("InMemoryRunRepository", () => {
  let repo: InMemoryRunRepository;

  beforeEach(() => {
    repo = new InMemoryRunRepository();
  });

  it("creates a run in pending state", async () => {
    const created = repo.create("agent-1", "Hello");

    expect(created).toBeInstanceOf(Promise);

    const run = await created;
    expect(run.id).toBeDefined();
    expect(run.status).toBe("pending");
    expect(run.agentId).toBe("agent-1");
    expect(run.input).toBe("Hello");
  });

  it("updates run status", async () => {
    const run = await repo.create("agent-1", "Hello");
    await new Promise((resolve) => setTimeout(resolve, 5));
    const updated = await repo.updateStatus(run.id, "running");
    expect(updated?.status).toBe("running");
    expect(updated?.updatedAt).not.toBe(run.createdAt);
  });

  it("sets error on failure", async () => {
    const run = await repo.create("agent-1", "Hello");
    const updated = await repo.updateStatus(run.id, "failed", "Timeout");
    expect(updated?.status).toBe("failed");
    expect(updated?.error).toBe("Timeout");
  });

  it("returns undefined for unknown run", async () => {
    await expect(
      repo.updateStatus("unknown", "running"),
    ).resolves.toBeUndefined();
  });
});

describe("InMemoryMessageRepository", () => {
  let repo: InMemoryMessageRepository;

  beforeEach(() => {
    repo = new InMemoryMessageRepository();
  });

  it("appends and retrieves messages by run id", async () => {
    await repo.append("run-1", { role: "system", content: "You are helpful" });
    await repo.append("run-1", { role: "user", content: "Hello" });
    const messages = await repo.listByRunId("run-1");
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe("system");
    expect(messages[1].role).toBe("user");
  });

  it("returns empty array for unknown run", async () => {
    await expect(repo.listByRunId("unknown")).resolves.toEqual([]);
  });
});

describe("AgentService", () => {
  let service: AgentService;

  beforeEach(() => {
    const registry = new ToolRegistry();
    registerBuiltinTools(registry);
    service = new AgentService(registry, { maxTurns: 10, llmTimeoutMs: 30000 });
  });

  it("creates and retrieves an agent", async () => {
    const created = service.createAgent({
      name: "Test Agent",
      systemPrompt: "Be helpful",
      provider: { provider: "openai", model: "gpt-4o" },
      tools: ["echo"],
    });

    expect(created).toBeInstanceOf(Promise);

    const agent = await created;
    await expect(service.getAgent(agent.id)).resolves.toEqual(agent);
  });

  it("lists agents", async () => {
    await service.createAgent({
      name: "A",
      systemPrompt: "X",
      provider: { provider: "openai", model: "m" },
      tools: [],
    });
    await expect(service.listAgents()).resolves.toHaveLength(1);
  });

  it("deletes an agent", async () => {
    const agent = await service.createAgent({
      name: "Test",
      systemPrompt: "X",
      provider: { provider: "openai", model: "m" },
      tools: [],
    });
    await expect(service.deleteAgent(agent.id)).resolves.toBe(true);
    await expect(service.getAgent(agent.id)).resolves.toBeUndefined();
  });

  it("throws when submitting task for unknown agent", async () => {
    await expect(service.submitTask("nonexistent", "Hello")).rejects.toThrow(
      'Agent "nonexistent" not found',
    );
  });

  it("creates a run in pending state when submitting a task", async () => {
    const agent = await service.createAgent({
      name: "Test",
      systemPrompt: "X",
      provider: { provider: "test-provider", model: "test" },
      tools: [],
    });
    const run = await service.submitTask(agent.id, "Hello");
    expect(run.status).toBe("pending");
    expect(run.agentId).toBe(agent.id);
  });
});

describe("executeRun metrics", () => {
  beforeEach(() => {
    resetMetricsRegistry();
  });

  it("records failed agent executions when model resolution fails", async () => {
    const registry = new ToolRegistry();
    registerBuiltinTools(registry);
    const runs = new InMemoryRunRepository();
    const messages = new InMemoryMessageRepository();
    const run = await runs.create("agent-metrics", "Hello");

    await executeRun(
      run.id,
      {
        id: "agent-metrics",
        name: "Broken Provider Agent",
        systemPrompt: "Fail fast",
        provider: { provider: "missing-provider", model: "none" },
        tools: [],
      },
      "Hello",
      registry,
      runs,
      messages,
      { maxTurns: 1, llmTimeoutMs: 1000 },
    );

    const output = await getMetricsRegistry().metrics();
    expect(output).toContain("agent_executions_total");
    expect(output).toContain(
      'agent_executions_total{agent_id="agent-metrics",status="failed"} 1',
    );
    expect(output).toContain("agent_execution_duration_seconds_bucket");
    expect(output).toContain('agent_id="agent-metrics"');
  });
});
