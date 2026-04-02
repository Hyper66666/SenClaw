import type { LanguageModel } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToolRegistry } from "../../apps/tool-runner-host/src/index.js";
import { AgentService } from "../../apps/agent-runner/src/agent-service.js";
import { registerAgentTaskOrchestrationTools } from "../../apps/gateway/src/orchestration-tools.js";
import { registerProviderFactory } from "../../apps/agent-runner/src/model-provider.js";
import {
  InMemoryAgentRepository,
  InMemoryAgentTaskMessageRepository,
  InMemoryAgentTaskPendingMessageRepository,
  InMemoryAgentTaskRepository,
  InMemoryMessageRepository,
  InMemoryRunRepository,
} from "../../apps/agent-runner/src/repositories.js";
import { decideCoordinatorAction } from "../../apps/agent-runner/src/coordinator-mode.js";

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

function createGenerateTextResult(text: string) {
  return {
    text,
    finishReason: "stop",
    steps: [],
    usage: {
      inputTokens: 3,
      outputTokens: 2,
    },
  };
}

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

describe("coordinator orchestration integration", () => {
  beforeEach(() => {
    aiMocks.generateTextMock.mockReset();
    aiMocks.stepCountIsMock.mockClear();
    aiMocks.toolMock.mockClear();
    registerProviderFactory(
      "coordinator-runtime-test",
      () => ({ providerId: "coordinator-runtime-test" }) as LanguageModel,
    );
    aiMocks.generateTextMock.mockResolvedValue(
      createGenerateTextResult("background complete"),
    );
  });

  it("covers direct-answer, spawn, and reuse coordinator decisions end to end", async () => {
    const registry = new ToolRegistry();
    const taskRepo = new InMemoryAgentTaskRepository();
    const service = new AgentService(
      registry,
      { maxTurns: 2, llmTimeoutMs: 1000 },
      new InMemoryAgentRepository(),
      new InMemoryRunRepository(),
      new InMemoryMessageRepository(),
      taskRepo,
      new InMemoryAgentTaskMessageRepository(taskRepo),
      new InMemoryAgentTaskPendingMessageRepository(),
    );
    registerAgentTaskOrchestrationTools(registry, service);

    expect(
      decideCoordinatorAction({
        requiresDelegation: false,
      }),
    ).toEqual({
      action: "direct",
      reason: "The current task can be answered directly without a worker.",
    });

    const worker = await service.createAgent({
      name: "Worker Agent",
      systemPrompt: "Do delegated work",
      provider: { provider: "coordinator-runtime-test", model: "test-model" },
      tools: [],
      background: true,
    });

    expect(
      decideCoordinatorAction({
        requiresDelegation: true,
      }),
    ).toEqual({
      action: "spawn",
      reason: "Specialized or long-running work requires a new worker.",
    });

    const spawnResult = await registry.executeTool(
      "spawn-1",
      "agent_tasks.spawn",
      {
        agentId: worker.id,
        input: "Investigate repository state",
      },
    );
    expect(spawnResult.success).toBe(true);
    const spawnedTask = JSON.parse(spawnResult.content ?? "{}") as {
      id: string;
    };

    expect(
      decideCoordinatorAction({
        requiresDelegation: true,
        existingTaskId: spawnedTask.id,
      }),
    ).toEqual({
      action: "reuse",
      taskId: spawnedTask.id,
      reason: "A relevant worker already exists and should be continued.",
    });

    const sendResult = await registry.executeTool(
      "msg-1",
      "agent_tasks.send_message",
      {
        taskId: spawnedTask.id,
        content: "Continue with the second half",
      },
    );
    expect(sendResult.success).toBe(true);

    const transcript = await waitFor(
      async () => await service.getAgentTaskMessages(spawnedTask.id),
      (messages) =>
        messages.some(
          (message) =>
            message.role === "assistant" &&
            "content" in message &&
            message.content === "background complete",
        ),
    );
    expect(transcript).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: "user",
          content: "Continue with the second half",
        }),
      ]),
    );
  });
});
