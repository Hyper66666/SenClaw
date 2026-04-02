import { describe, expect, it } from "vitest";
import { ToolRegistry } from "@senclaw/tool-runner-host";
import { AgentService } from "@senclaw/agent-runner";
import {
  InMemoryAgentRepository,
  InMemoryAgentTaskMessageRepository,
  InMemoryAgentTaskPendingMessageRepository,
  InMemoryAgentTaskRepository,
  InMemoryMessageRepository,
  InMemoryRunRepository,
} from "../../agent-runner/src/repositories.js";
import { registerAgentTaskOrchestrationTools } from "../src/orchestration-tools.js";

describe("registerAgentTaskOrchestrationTools", () => {
  function createService() {
    const agentRepo = new InMemoryAgentRepository();
    const runRepo = new InMemoryRunRepository();
    const messageRepo = new InMemoryMessageRepository();
    const taskRepo = new InMemoryAgentTaskRepository();
    const taskMessageRepo = new InMemoryAgentTaskMessageRepository(taskRepo);
    const pendingRepo = new InMemoryAgentTaskPendingMessageRepository();
    return new AgentService(
      new ToolRegistry(),
      { maxTurns: 1, llmTimeoutMs: 1000 },
      agentRepo,
      runRepo,
      messageRepo,
      taskRepo,
      taskMessageRepo,
      pendingRepo,
    );
  }

  it("registers orchestration tools and lets coordinators inspect and reuse tasks", async () => {
    const registry = new ToolRegistry();
    const service = createService();
    registerAgentTaskOrchestrationTools(registry, service);

    const agent = await service.createAgent({
      name: "Worker Agent",
      systemPrompt: "Do delegated work",
      provider: { provider: "test-provider", model: "test-model" },
      tools: [],
      background: true,
    });

    const spawn = await registry.executeTool("tc-spawn", "agent_tasks.spawn", {
      agentId: agent.id,
      input: "Investigate the repository",
    });
    expect(spawn.success).toBe(true);
    const spawnedTask = JSON.parse(spawn.content ?? "{}") as { id: string };

    const list = await registry.executeTool("tc-list", "agent_tasks.list", {});
    expect(list.success).toBe(true);
    expect(JSON.parse(list.content ?? "[]")).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: spawnedTask.id })]),
    );

    const message = await registry.executeTool(
      "tc-message",
      "agent_tasks.send_message",
      {
        taskId: spawnedTask.id,
        content: "Continue with the second half",
      },
    );
    expect(message.success).toBe(true);

    const inspect = await registry.executeTool("tc-get", "agent_tasks.get", {
      taskId: spawnedTask.id,
    });
    expect(inspect.success).toBe(true);
    const payload = JSON.parse(inspect.content ?? "{}") as {
      task?: { id: string };
      messages?: Array<{ role: string; content?: string }>;
    };
    expect(payload.task?.id).toBe(spawnedTask.id);
    expect(payload.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: "user",
          content: "Continue with the second half",
        }),
      ]),
    );

    const resumed = await registry.executeTool(
      "tc-resume",
      "agent_tasks.resume",
      {
        taskId: spawnedTask.id,
      },
    );
    expect(resumed.success).toBe(true);
  });
});
