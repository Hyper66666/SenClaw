import type {
  IMessageRepository,
  IRunRepository,
  Message,
  Run,
  RunStatus,
} from "@senclaw/protocol";
import { ToolRegistry, registerBuiltinTools } from "@senclaw/tool-runner-host";
import { describe, expect, it } from "vitest";
import { AgentService } from "../src/agent-service.js";
import {
  InMemoryMessageRepository,
  InMemoryRunRepository,
} from "../src/repositories.js";

class ThrowingMessageRepository implements IMessageRepository {
  async append(): Promise<void> {
    throw new Error("message store offline");
  }

  async listByRunId(): Promise<Message[]> {
    return [];
  }
}

class RecordingRunRepository extends InMemoryRunRepository {
  readonly updates: Array<{ id: string; status: RunStatus; error?: string }> =
    [];

  override async updateStatus(
    id: string,
    status: RunStatus,
    error?: string,
  ): Promise<Run | undefined> {
    this.updates.push({ id, status, error });
    return super.updateStatus(id, status, error);
  }
}

class FailingFailedStatusRunRepository extends RecordingRunRepository {
  override async updateStatus(
    id: string,
    status: RunStatus,
    error?: string,
  ): Promise<Run | undefined> {
    this.updates.push({ id, status, error });
    if (status === "failed") {
      throw new Error("status store offline");
    }
    return super.updateStatus(id, status, error);
  }
}

describe("AgentService background failure handling", () => {
  function createService(
    runRepo: IRunRepository,
    messageRepo: IMessageRepository,
  ): AgentService {
    const registry = new ToolRegistry();
    registerBuiltinTools(registry);
    return new AgentService(
      registry,
      { maxTurns: 2, llmTimeoutMs: 1000 },
      undefined,
      runRepo,
      messageRepo,
    );
  }

  it("marks the run failed when background execution rejects after submission", async () => {
    const runs = new RecordingRunRepository();
    const service = createService(runs, new ThrowingMessageRepository());
    const agent = await service.createAgent({
      name: "Failure Agent",
      systemPrompt: "Be helpful",
      provider: { provider: "test-provider", model: "test" },
      tools: [],
    });

    const run = await service.submitTask(agent.id, "Hello");
    await new Promise((resolve) => setTimeout(resolve, 0));

    const storedRun = await service.getRun(run.id);
    expect(storedRun?.status).toBe("failed");
    expect(storedRun?.error).toBe("message store offline");
  });

  it("does not leak an unhandled rejection when persisting the failed status also fails", async () => {
    const runs = new FailingFailedStatusRunRepository();
    const service = createService(runs, new ThrowingMessageRepository());
    const agent = await service.createAgent({
      name: "Failure Agent",
      systemPrompt: "Be helpful",
      provider: { provider: "test-provider", model: "test" },
      tools: [],
    });

    const run = await service.submitTask(agent.id, "Hello");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(runs.updates).toContainEqual({
      id: run.id,
      status: "failed",
      error: "message store offline",
    });
  });
});
