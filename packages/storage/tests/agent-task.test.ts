import { describe, expect, it } from "vitest";
import { createStorage } from "../src/index.js";

describe("Sqlite agent task repositories", () => {
  it("creates and updates persisted agent tasks", async () => {
    const storage = createStorage(":memory:");

    const task = await storage.agentTasks.create({
      selectedAgentId: "agent-1",
      initialInput: "Inspect the repository",
      background: true,
      parentRunId: "run-parent",
      metadata: { requestedBy: "coordinator" },
    });

    expect(task.status).toBe("pending");
    expect(task.transcript.taskId).toBe(task.id);
    expect(task.transcript.lastMessageSeq).toBe(0);

    const updated = await storage.agentTasks.updateStatus(task.id, "running");
    expect(updated?.status).toBe("running");

    const activeRun = await storage.agentTasks.setActiveRun(task.id, "run-1");
    expect(activeRun?.activeRunId).toBe("run-1");
  });

  it("persists transcript entries and updates transcript cursor", async () => {
    const storage = createStorage(":memory:");
    const task = await storage.agentTasks.create({
      selectedAgentId: "agent-1",
      initialInput: "Inspect the repository",
      metadata: {},
    });

    const entry = await storage.agentTaskMessages.append(task.id, {
      role: "assistant",
      content: "Working on it",
    });

    expect(entry.seq).toBeGreaterThan(0);
    const transcript = await storage.agentTaskMessages.listByTaskId(task.id);
    expect(transcript).toHaveLength(1);
    expect(transcript[0]?.message).toMatchObject({
      role: "assistant",
      content: "Working on it",
    });

    const reloaded = await storage.agentTasks.get(task.id);
    expect(reloaded?.transcript.lastMessageSeq).toBe(entry.seq);
  });

  it("queues and resolves pending follow-up messages", async () => {
    const storage = createStorage(":memory:");
    const task = await storage.agentTasks.create({
      selectedAgentId: "agent-1",
      initialInput: "Inspect the repository",
      metadata: {},
    });

    const queued = await storage.agentTaskPendingMessages.enqueue({
      taskId: task.id,
      role: "user",
      content: "Continue with the second half",
    });

    const pending = await storage.agentTaskPendingMessages.listPendingByTaskId(
      task.id,
    );
    expect(pending).toHaveLength(1);
    expect(pending[0]?.id).toBe(queued.id);

    const delivered = await storage.agentTaskPendingMessages.markDelivered(
      queued.id,
    );
    expect(delivered?.deliveredAt).toBeDefined();
    await expect(
      storage.agentTaskPendingMessages.listPendingByTaskId(task.id),
    ).resolves.toHaveLength(0);
  });
});
