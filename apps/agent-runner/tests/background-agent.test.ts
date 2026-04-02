import type { LanguageModel } from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToolRegistry } from "@senclaw/tool-runner-host";
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

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

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

async function getTaskOrThrow(service: AgentService, taskId: string) {
  const task = await service.getAgentTask(taskId);
  if (!task) {
    throw new Error(`Agent task "${taskId}" not found in test`);
  }
  return task;
}

describe("AgentService background agents", () => {
  beforeEach(() => {
    aiMocks.generateTextMock.mockReset();
    aiMocks.stepCountIsMock.mockClear();
    aiMocks.toolMock.mockClear();
    registerProviderFactory(
      "background-test",
      () => ({ providerId: "background-test" }) as LanguageModel,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function createService() {
    const agentRepo = new InMemoryAgentRepository();
    const runRepo = new InMemoryRunRepository();
    const messageRepo = new InMemoryMessageRepository();
    const taskRepo = new InMemoryAgentTaskRepository();
    const taskMessageRepo = new InMemoryAgentTaskMessageRepository(taskRepo);
    const pendingRepo = new InMemoryAgentTaskPendingMessageRepository();
    return new AgentService(
      new ToolRegistry(),
      { maxTurns: 2, llmTimeoutMs: 1_000 },
      agentRepo,
      runRepo,
      messageRepo,
      taskRepo,
      taskMessageRepo,
      pendingRepo,
    );
  }

  it("persists transcript and completes a background task", async () => {
    aiMocks.generateTextMock.mockResolvedValue(
      createGenerateTextResult("done"),
    );

    const service = createService();
    const agent = await service.createAgent({
      name: "Background Agent",
      systemPrompt: "Be helpful",
      provider: { provider: "background-test", model: "test-model" },
      tools: [],
      background: true,
    });

    const task = await service.createBackgroundTask(agent.id, "Inspect repo");
    const completedTask = await waitFor(
      async () => await getTaskOrThrow(service, task.id),
      (value) => value.status === "completed",
    );

    expect(completedTask.activeRunId).toBeUndefined();
    const transcript = await service.getAgentTaskMessages(task.id);
    expect(transcript).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: "system" }),
        expect.objectContaining({ role: "user", content: "Inspect repo" }),
        expect.objectContaining({ role: "assistant", content: "done" }),
      ]),
    );

    const runs = await service.listRuns();
    expect(runs[0]).toMatchObject({ agentTaskId: task.id });
  });

  it("queues follow-up messages while a background task is running", async () => {
    const first = createDeferred<ReturnType<typeof createGenerateTextResult>>();
    aiMocks.generateTextMock.mockImplementationOnce(() => first.promise);
    aiMocks.generateTextMock.mockResolvedValueOnce(
      createGenerateTextResult("follow-up complete"),
    );

    const service = createService();
    const agent = await service.createAgent({
      name: "Background Agent",
      systemPrompt: "Be helpful",
      provider: { provider: "background-test", model: "test-model" },
      tools: [],
      background: true,
    });

    const task = await service.createBackgroundTask(agent.id, "First step");
    await waitFor(
      async () => await getTaskOrThrow(service, task.id),
      (value) => value.status === "running" && !!value.activeRunId,
    );

    await service.sendMessageToAgentTask(task.id, "Continue with second step");
    const pendingBefore = await service.getPendingAgentTaskMessages(task.id);
    expect(pendingBefore).toHaveLength(1);

    first.resolve(createGenerateTextResult("first complete"));

    const completedTask = await waitFor(
      async () => await getTaskOrThrow(service, task.id),
      (value) => value.status === "completed" && !value.activeRunId,
    );
    expect(completedTask.status).toBe("completed");

    const pendingAfter = await service.getPendingAgentTaskMessages(task.id);
    expect(pendingAfter).toHaveLength(0);

    const runs = await service.listRuns();
    expect(runs).toHaveLength(2);
    expect(runs[1]).toMatchObject({ agentTaskId: task.id });

    const transcript = await service.getAgentTaskMessages(task.id);
    expect(transcript).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: "user",
          content: "Continue with second step",
        }),
        expect.objectContaining({
          role: "assistant",
          content: "follow-up complete",
        }),
      ]),
    );
  });

  it("restarts a stopped background task when a follow-up message arrives", async () => {
    aiMocks.generateTextMock.mockResolvedValueOnce(
      createGenerateTextResult("first complete"),
    );
    aiMocks.generateTextMock.mockResolvedValueOnce(
      createGenerateTextResult("resumed complete"),
    );

    const service = createService();
    const agent = await service.createAgent({
      name: "Background Agent",
      systemPrompt: "Be helpful",
      provider: { provider: "background-test", model: "test-model" },
      tools: [],
      background: true,
    });

    const task = await service.createBackgroundTask(agent.id, "Initial step");
    await waitFor(
      async () => await getTaskOrThrow(service, task.id),
      (value) => value.status === "completed",
    );

    await service.sendMessageToAgentTask(task.id, "Resume from current state");

    await waitFor(
      async () => await service.listRuns(),
      (runs) => runs.length >= 2,
    );
    const completedTask = await waitFor(
      async () => await getTaskOrThrow(service, task.id),
      (value) => value.status === "completed" && !value.activeRunId,
    );
    expect(completedTask.status).toBe("completed");

    const transcript = await waitFor(
      async () => await service.getAgentTaskMessages(task.id),
      (messages) =>
        messages.some(
          (message) =>
            message.role === "assistant" &&
            "content" in message &&
            message.content === "resumed complete",
        ),
    );
    expect(transcript).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: "user",
          content: "Resume from current state",
        }),
        expect.objectContaining({
          role: "assistant",
          content: "resumed complete",
        }),
      ]),
    );
  });
});
