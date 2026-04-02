import type { LanguageModel } from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToolRegistry, registerBuiltinTools } from "@senclaw/tool-runner-host";
import { AgentService } from "../src/agent-service.js";
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

function createApprovalGeneratingMock() {
  aiMocks.generateTextMock.mockImplementation(
    async (request: {
      tools: Record<
        string,
        {
          execute: (args: { path: string }) => Promise<unknown>;
        }
      >;
    }) => {
      const tool = request.tools["fs.read_text"];
      const output = await tool.execute({ path: "C:/protected.txt" });
      return {
        text: "",
        finishReason: "stop",
        steps: [
          {
            toolCalls: [
              {
                toolCallId: "call-1",
                toolName: "fs.read_text",
                args: { path: "C:/protected.txt" },
              },
            ],
            toolResults: [
              {
                toolCallId: "call-1",
                output,
              },
            ],
          },
        ],
        usage: {
          inputTokens: 3,
          outputTokens: 2,
        },
      };
    },
  );
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

describe("shared runtime parity", () => {
  beforeEach(() => {
    aiMocks.generateTextMock.mockReset();
    aiMocks.stepCountIsMock.mockClear();
    aiMocks.toolMock.mockClear();
    registerProviderFactory(
      "shared-runtime-test",
      () => ({ providerId: "shared-runtime-test" }) as LanguageModel,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function createService() {
    const registry = new ToolRegistry();
    registerBuiltinTools(registry, {
      requestApproval: () => "approval-1",
      fileSystem: {
        readFile: async () => {
          const error = new Error("blocked") as NodeJS.ErrnoException;
          error.code = "EACCES";
          throw error;
        },
      },
    });

    const agentRepo = new InMemoryAgentRepository();
    const runRepo = new InMemoryRunRepository();
    const messageRepo = new InMemoryMessageRepository();
    const taskRepo = new InMemoryAgentTaskRepository();
    const taskMessageRepo = new InMemoryAgentTaskMessageRepository(taskRepo);
    const pendingRepo = new InMemoryAgentTaskPendingMessageRepository();
    const service = new AgentService(
      registry,
      { maxTurns: 2, llmTimeoutMs: 1000 },
      agentRepo,
      runRepo,
      messageRepo,
      taskRepo,
      taskMessageRepo,
      pendingRepo,
    );

    return { service };
  }

  it("uses the same approval and tool-result semantics for direct and delegated execution", async () => {
    createApprovalGeneratingMock();
    const { service } = createService();
    const agent = await service.createAgent({
      name: "Parity Agent",
      systemPrompt: "Use the read tool when needed.",
      provider: { provider: "shared-runtime-test", model: "test-model" },
      tools: ["fs.read_text"],
      background: true,
    });

    const directRun = await service.submitTask(
      agent.id,
      "Read the protected file",
    );
    const backgroundTask = await service.createBackgroundTask(
      agent.id,
      "Read the protected file",
    );

    const directMessages = await waitFor(
      async () => await service.getRunMessages(directRun.id),
      (messages) => messages.some((message) => message.role === "tool"),
    );
    const delegatedMessages = await waitFor(
      async () => await service.getAgentTaskMessages(backgroundTask.id),
      (messages) => messages.some((message) => message.role === "tool"),
    );

    expect(directMessages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: "assistant",
          toolCalls: [
            expect.objectContaining({
              toolName: "fs.read_text",
            }),
          ],
        }),
        expect.objectContaining({
          role: "tool",
          content: expect.stringContaining("Approval required"),
        }),
      ]),
    );

    expect(delegatedMessages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: "assistant",
          toolCalls: [
            expect.objectContaining({
              toolName: "fs.read_text",
            }),
          ],
        }),
        expect.objectContaining({
          role: "tool",
          content: expect.stringContaining("Approval required"),
        }),
      ]),
    );
  });
});
