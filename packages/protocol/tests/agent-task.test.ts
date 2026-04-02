import { describe, expect, expectTypeOf, it } from "vitest";
import {
  AgentRunLinkSchema,
  AgentTaskPendingMessageSchema,
  AgentTaskSchema,
  AgentTaskStatusEnum,
  AgentTranscriptEntrySchema,
  AgentTranscriptReferenceSchema,
  CreateAgentTaskSchema,
  type IAgentTaskMessageRepository,
  type IAgentTaskPendingMessageRepository,
  type IAgentTaskRepository,
} from "../src/index.js";

describe("agent task protocol schemas", () => {
  const now = new Date().toISOString();

  it("accepts create task payloads", () => {
    const result = CreateAgentTaskSchema.safeParse({
      selectedAgentId: "agent-1",
      initialInput: "Inspect the repository",
      background: true,
      parentRunId: "run-1",
      metadata: { requestedBy: "coordinator" },
    });

    expect(result.success).toBe(true);
  });

  it("accepts persisted tasks, transcript entries, and pending messages", () => {
    expect(
      AgentTaskSchema.safeParse({
        id: "task-1",
        selectedAgentId: "agent-1",
        status: "running",
        initialInput: "Inspect the repository",
        background: true,
        parentRunId: "run-1",
        parentTaskId: "task-parent",
        activeRunId: "run-2",
        transcript: { taskId: "task-1", lastMessageSeq: 3 },
        metadata: { requestedBy: "coordinator" },
        createdAt: now,
        updatedAt: now,
      }).success,
    ).toBe(true);

    expect(
      AgentTranscriptEntrySchema.safeParse({
        seq: 1,
        taskId: "task-1",
        sourceRunId: "run-2",
        message: { role: "assistant", content: "Working on it" },
        insertedAt: now,
      }).success,
    ).toBe(true);

    expect(
      AgentTaskPendingMessageSchema.safeParse({
        id: "pm-1",
        taskId: "task-1",
        role: "user",
        content: "Continue with the second half",
        createdAt: now,
      }).success,
    ).toBe(true);
  });

  it("exports task status and linkage schemas", () => {
    expect(AgentTaskStatusEnum.safeParse("paused").success).toBe(true);
    expect(
      AgentRunLinkSchema.safeParse({
        parentRunId: "run-1",
        agentTaskId: "task-1",
      }).success,
    ).toBe(true);
    expect(
      AgentTranscriptReferenceSchema.safeParse({
        taskId: "task-1",
      }).success,
    ).toBe(true);
  });
});

describe("agent task repository contracts", () => {
  it("exports repository contract types", () => {
    type HasAgentTaskCreate = IAgentTaskRepository["create"];
    type HasAgentTranscriptAppend = IAgentTaskMessageRepository["append"];
    type HasAgentPendingEnqueue = IAgentTaskPendingMessageRepository["enqueue"];

    expectTypeOf<HasAgentTaskCreate>().toBeFunction();
    expectTypeOf<HasAgentTranscriptAppend>().toBeFunction();
    expectTypeOf<HasAgentPendingEnqueue>().toBeFunction();
  });
});
