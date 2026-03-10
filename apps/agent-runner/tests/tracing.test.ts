import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LanguageModel } from "ai";
import { InMemorySpanExporter } from "@opentelemetry/sdk-trace-base";
import { initializeTracing, shutdownTracing } from "@senclaw/observability";
import {
  InMemoryMessageRepository,
  InMemoryRunRepository,
} from "../src/repositories.js";
import { registerProviderFactory } from "../src/model-provider.js";
import { executeRun } from "../src/execution-loop.js";
import { ToolRegistry } from "@senclaw/tool-runner-host";

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

describe("executeRun tracing", () => {
  beforeEach(() => {
    aiMocks.generateTextMock.mockReset();
  });

  afterEach(async () => {
    await shutdownTracing();
  });

  it("exports agent.execute and llm.call spans", async () => {
    const exporter = new InMemorySpanExporter();
    await initializeTracing({
      serviceName: "agent-runner-test",
      enabled: true,
      exporter,
      autoInstrumentations: false,
    });

    registerProviderFactory(
      "trace-test",
      () => ({ providerId: "trace-test" }) as LanguageModel,
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
    const registry = new ToolRegistry();
    const run = await runs.create("agent-trace", "Hello");

    await executeRun(
      run.id,
      {
        id: "agent-trace",
        name: "Trace Agent",
        systemPrompt: "Trace everything",
        provider: { provider: "trace-test", model: "trace-model" },
        tools: [],
      },
      "Hello",
      registry,
      runs,
      messages,
      { maxTurns: 1, llmTimeoutMs: 1000 },
    );

    const spans = await waitForFinishedSpans(exporter, 2);
    const agentSpan = spans.find((span) => span.name === "agent.execute");
    const llmSpan = spans.find((span) => span.name === "llm.call");

    expect(agentSpan?.attributes["agent.id"]).toBe("agent-trace");
    expect(llmSpan?.attributes["llm.provider"]).toBe("trace-test");
    expect(llmSpan?.attributes["llm.model"]).toBe("trace-model");
    expect(llmSpan?.parentSpanContext?.spanId).toBe(
      agentSpan?.spanContext().spanId,
    );
  });
});
