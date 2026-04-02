import { InMemorySpanExporter } from "@opentelemetry/sdk-trace-base";
import { initializeTracing, shutdownTracing } from "@senclaw/observability";
import { ToolRegistry } from "@senclaw/tool-runner-host";
import type { LanguageModel } from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { executeRunRequest } from "../src/execution-loop.js";
import { registerProviderFactory } from "../src/model-provider.js";
import {
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

describe("executeRunRequest", () => {
  beforeEach(() => {
    aiMocks.generateTextMock.mockReset();
  });

  afterEach(async () => {
    await shutdownTracing();
  });

  it("records parent run and agent task linkage on the shared runtime path", async () => {
    const exporter = new InMemorySpanExporter();
    await initializeTracing({
      serviceName: "agent-runner-runtime-request-test",
      enabled: true,
      exporter,
      autoInstrumentations: false,
    });

    registerProviderFactory(
      "trace-runtime-test",
      () => ({ providerId: "trace-runtime-test" }) as LanguageModel,
    );
    aiMocks.generateTextMock.mockResolvedValue({
      text: "hello",
      finishReason: "stop",
      steps: [],
      usage: {
        inputTokens: 3,
        outputTokens: 2,
      },
    });

    const runs = new InMemoryRunRepository();
    const messages = new InMemoryMessageRepository();
    const run = await runs.create("agent-trace", "Hello", {
      parentRunId: "run-parent",
      agentTaskId: "task-1",
    });

    await executeRunRequest({
      runId: run.id,
      agent: {
        id: "agent-trace",
        name: "Trace Agent",
        systemPrompt: "Trace everything",
        provider: { provider: "trace-runtime-test", model: "trace-model" },
        tools: [],
      },
      userInput: "Hello",
      toolRegistry: new ToolRegistry(),
      runRepo: runs,
      messageRepo: messages,
      options: { maxTurns: 1, llmTimeoutMs: 1000 },
      link: {
        parentRunId: "run-parent",
        agentTaskId: "task-1",
      },
    });

    const spans = await waitForFinishedSpans(exporter, 2);
    const agentSpan = spans.find((span) => span.name === "agent.execute");

    expect(agentSpan?.attributes["run.parent_id"]).toBe("run-parent");
    expect(agentSpan?.attributes["agent.task_id"]).toBe("task-1");
  });
});
