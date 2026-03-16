import { ToolRegistry } from "@senclaw/tool-runner-host";
import type { IRunRepository, Run, RunStatus } from "@senclaw/protocol";
import type { LanguageModel } from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { executeRun } from "../src/execution-loop.js";
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

class RecordingRunRepository implements IRunRepository {
  readonly inner = new InMemoryRunRepository();
  readonly updates: Array<{ id: string; status: RunStatus; error?: string }> =
    [];

  async create(agentId: string, input: string): Promise<Run> {
    return this.inner.create(agentId, input);
  }

  async get(id: string): Promise<Run | undefined> {
    return this.inner.get(id);
  }

  async list(): Promise<Run[]> {
    return this.inner.list();
  }

  async updateStatus(
    id: string,
    status: RunStatus,
    error?: string,
  ): Promise<Run | undefined> {
    this.updates.push({ id, status, error });
    if (status === "failed") {
      throw new Error("storage unavailable");
    }
    return this.inner.updateStatus(id, status, error);
  }
}

describe("executeRun failure handling", () => {
  beforeEach(() => {
    aiMocks.generateTextMock.mockReset();
    aiMocks.stepCountIsMock.mockClear();
    aiMocks.toolMock.mockClear();

    registerProviderFactory(
      "execute-run-test",
      () => ({ providerId: "execute-run-test" }) as LanguageModel,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("clears the timeout timer when the LLM call throws", async () => {
    aiMocks.generateTextMock.mockRejectedValue(new Error("model exploded"));

    const timerHandle = { id: "timer-handle" } as unknown as ReturnType<
      typeof setTimeout
    >;
    const setTimeoutSpy = vi
      .spyOn(globalThis, "setTimeout")
      .mockImplementation(() => timerHandle);
    const clearTimeoutSpy = vi
      .spyOn(globalThis, "clearTimeout")
      .mockImplementation(() => undefined);

    const runs = new InMemoryRunRepository();
    const messages = new InMemoryMessageRepository();
    const run = await runs.create("agent-timeout", "Hello");

    await executeRun(
      run.id,
      {
        id: "agent-timeout",
        name: "Timeout Cleanup Agent",
        systemPrompt: "Fail cleanly",
        provider: { provider: "execute-run-test", model: "test-model" },
        tools: [],
      },
      "Hello",
      new ToolRegistry(),
      runs,
      messages,
      { maxTurns: 1, llmTimeoutMs: 1000 },
    );

    expect(setTimeoutSpy).toHaveBeenCalledOnce();
    expect(clearTimeoutSpy).toHaveBeenCalledWith(timerHandle);
  });

  it("keeps the original failure reason when persisting the failed run state also fails", async () => {
    aiMocks.generateTextMock.mockRejectedValue(new Error("model exploded"));

    const runs = new RecordingRunRepository();
    const messages = new InMemoryMessageRepository();
    const run = await runs.create("agent-failure", "Hello");

    await expect(
      executeRun(
        run.id,
        {
          id: "agent-failure",
          name: "Failure Agent",
          systemPrompt: "Fail cleanly",
          provider: { provider: "execute-run-test", model: "test-model" },
          tools: [],
        },
        "Hello",
        new ToolRegistry(),
        runs,
        messages,
        { maxTurns: 1, llmTimeoutMs: 1000 },
      ),
    ).resolves.toBeUndefined();

    expect(runs.updates).toContainEqual({
      id: run.id,
      status: "failed",
      error: "model exploded",
    });
    expect(
      runs.updates.filter((update) => update.status === "failed"),
    ).toHaveLength(1);
  });
});
