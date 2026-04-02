import type { LanguageModel } from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToolRegistry } from "@senclaw/tool-runner-host";
import { AgentService } from "../src/agent-service.js";
import { executeRunRequest } from "../src/execution-loop.js";
import { registerProviderFactory } from "../src/model-provider.js";
import {
  InMemoryAgentRepository,
  InMemoryAgentTaskMessageRepository,
  InMemoryAgentTaskPendingMessageRepository,
  InMemoryAgentTaskRepository,
  InMemoryMessageRepository,
  InMemoryRunRepository,
} from "../src/repositories.js";

const aiMocks = vi.hoisted(() => ({
  generateTextMock: vi.fn(),
  stepCountIsMock: vi.fn(() => Symbol("stop")),
  toolMock: vi.fn((definition: unknown) => definition),
}));

vi.mock("ai", () => ({
  generateText: aiMocks.generateTextMock,
  stepCountIs: aiMocks.stepCountIsMock,
  tool: aiMocks.toolMock,
}));

describe("declarative agent runtime options", () => {
  beforeEach(() => {
    aiMocks.generateTextMock.mockReset();
    aiMocks.stepCountIsMock.mockClear();
    aiMocks.toolMock.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses an agent-specific maxTurns override when present", async () => {
    registerProviderFactory(
      "definition-runtime-test",
      () => ({ providerId: "definition-runtime-test" }) as LanguageModel,
    );
    aiMocks.generateTextMock.mockResolvedValue({
      text: "hello",
      finishReason: "stop",
      steps: [],
      usage: {
        inputTokens: 1,
        outputTokens: 1,
      },
    });

    const runs = new InMemoryRunRepository();
    const messages = new InMemoryMessageRepository();
    const run = await runs.create("agent-turns", "Hello");

    await executeRunRequest({
      runId: run.id,
      agent: {
        id: "agent-turns",
        name: "Turn Agent",
        systemPrompt: "Keep it short",
        provider: {
          provider: "definition-runtime-test",
          model: "trace-model",
        },
        tools: [],
        maxTurns: 4,
        effort: "medium",
        isolation: "shared",
        permissionMode: "default",
        background: false,
      },
      userInput: "Hello",
      toolRegistry: new ToolRegistry(),
      runRepo: runs,
      messageRepo: messages,
      options: { maxTurns: 9, llmTimeoutMs: 1000 },
    });

    expect(aiMocks.stepCountIsMock).toHaveBeenCalledWith(4);
  });

  it("rejects background task creation for agents that do not allow it", async () => {
    const agentRepo = new InMemoryAgentRepository();
    const runRepo = new InMemoryRunRepository();
    const messageRepo = new InMemoryMessageRepository();
    const taskRepo = new InMemoryAgentTaskRepository();
    const taskMessageRepo = new InMemoryAgentTaskMessageRepository(taskRepo);
    const pendingRepo = new InMemoryAgentTaskPendingMessageRepository();
    const service = new AgentService(
      new ToolRegistry(),
      { maxTurns: 2, llmTimeoutMs: 1000 },
      agentRepo,
      runRepo,
      messageRepo,
      taskRepo,
      taskMessageRepo,
      pendingRepo,
    );

    const agent = await service.createAgent({
      name: "Foreground Only Agent",
      systemPrompt: "Stay in the foreground",
      provider: { provider: "test-provider", model: "test-model" },
      tools: [],
      background: false,
    });

    await expect(
      service.createBackgroundTask(agent.id, "Do work"),
    ).rejects.toThrow(/does not allow background execution/);
  });
});
