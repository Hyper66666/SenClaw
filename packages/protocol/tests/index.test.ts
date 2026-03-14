import { describe, expect, expectTypeOf, it } from "vitest";
import {
  AgentSchema,
  CreateAgentSchema,
  CreateScheduledJobSchema,
  type IAgentRepository,
  type IExecutionRepository,
  type IJobRepository,
  type IMessageRepository,
  type IRunRepository,
  MessageSchema,
  ProviderConfigSchema,
  RunSchema,
  ScheduledJobSchema,
  TaskSchema,
  ToolResultSchema,
  UpdateScheduledJobSchema,
} from "../src/index.js";

describe("ProviderConfigSchema", () => {
  it("accepts valid config with required fields only", () => {
    const result = ProviderConfigSchema.safeParse({
      provider: "openai",
      model: "gpt-4o",
    });
    expect(result.success).toBe(true);
  });

  it("accepts config with optional parameters", () => {
    const result = ProviderConfigSchema.safeParse({
      provider: "openai",
      model: "gpt-4o",
      temperature: 0.7,
      maxTokens: 1024,
    });
    expect(result.success).toBe(true);
  });

  it("accepts unknown provider identifiers", () => {
    const result = ProviderConfigSchema.safeParse({
      provider: "custom-provider",
      model: "my-model",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing provider", () => {
    const result = ProviderConfigSchema.safeParse({ model: "gpt-4o" });
    expect(result.success).toBe(false);
  });
});

describe("AgentSchema", () => {
  const validAgent = {
    id: "agent-1",
    name: "Test Agent",
    systemPrompt: "You are helpful",
    provider: { provider: "openai", model: "gpt-4o" },
    tools: ["echo"],
  };

  it("accepts a valid agent definition", () => {
    const result = AgentSchema.safeParse(validAgent);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe("agent-1");
      expect(result.data.tools).toEqual(["echo"]);
    }
  });

  it("defaults tools to empty array", () => {
    const { tools, ...noTools } = validAgent;
    const result = AgentSchema.safeParse(noTools);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tools).toEqual([]);
    }
  });

  it("rejects missing systemPrompt", () => {
    const { systemPrompt, ...missing } = validAgent;
    const result = AgentSchema.safeParse(missing);
    expect(result.success).toBe(false);
  });

  it("rejects missing provider", () => {
    const { provider, ...missing } = validAgent;
    const result = AgentSchema.safeParse(missing);
    expect(result.success).toBe(false);
  });
});

describe("CreateAgentSchema", () => {
  it("accepts agent without id", () => {
    const result = CreateAgentSchema.safeParse({
      name: "Test",
      systemPrompt: "You are helpful",
      provider: { provider: "openai", model: "gpt-4o" },
    });
    expect(result.success).toBe(true);
  });
});

describe("TaskSchema", () => {
  it("accepts valid task", () => {
    const result = TaskSchema.safeParse({
      agentId: "agent-1",
      input: "Hello",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing agentId", () => {
    const result = TaskSchema.safeParse({ input: "Hello" });
    expect(result.success).toBe(false);
  });

  it("rejects missing input", () => {
    const result = TaskSchema.safeParse({ agentId: "agent-1" });
    expect(result.success).toBe(false);
  });
});

describe("RunSchema", () => {
  const now = new Date().toISOString();
  const validRun = {
    id: "run-1",
    agentId: "agent-1",
    input: "Hello",
    status: "pending" as const,
    createdAt: now,
    updatedAt: now,
  };

  it("accepts all valid statuses", () => {
    for (const status of [
      "pending",
      "running",
      "completed",
      "failed",
    ] as const) {
      const result = RunSchema.safeParse({ ...validRun, status });
      expect(result.success).toBe(true);
    }
  });

  it("accepts failed run with error", () => {
    const result = RunSchema.safeParse({
      ...validRun,
      status: "failed",
      error: "Timeout exceeded",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.error).toBe("Timeout exceeded");
    }
  });

  it("rejects invalid status", () => {
    const result = RunSchema.safeParse({ ...validRun, status: "unknown" });
    expect(result.success).toBe(false);
  });
});

describe("MessageSchema", () => {
  it("parses user message", () => {
    const result = MessageSchema.safeParse({
      role: "user",
      content: "Hello",
    });
    expect(result.success).toBe(true);
  });

  it("parses system message", () => {
    const result = MessageSchema.safeParse({
      role: "system",
      content: "You are helpful",
    });
    expect(result.success).toBe(true);
  });

  it("parses assistant message with tool calls", () => {
    const result = MessageSchema.safeParse({
      role: "assistant",
      toolCalls: [
        {
          toolCallId: "tc-1",
          toolName: "get_weather",
          args: { city: "Beijing" },
        },
      ],
    });
    expect(result.success).toBe(true);
    if (result.success && result.data.role === "assistant") {
      expect(result.data.toolCalls).toHaveLength(1);
    }
  });

  it("parses tool result message", () => {
    const result = MessageSchema.safeParse({
      role: "tool",
      toolCallId: "tc-1",
      content: "Sunny, 25C",
    });
    expect(result.success).toBe(true);
  });
});

describe("ToolResultSchema", () => {
  it("parses successful result", () => {
    const result = ToolResultSchema.safeParse({
      toolCallId: "tc-1",
      success: true,
      content: "hello",
    });
    expect(result.success).toBe(true);
  });

  it("parses failed result", () => {
    const result = ToolResultSchema.safeParse({
      toolCallId: "tc-1",
      success: false,
      error: "Something went wrong",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.error).toBe("Something went wrong");
    }
  });
});

describe("ScheduledJobSchema", () => {
  const validJob = {
    id: "9f2c2c55-1f1f-4bd9-8bc7-a06d17d2d8d1",
    agentId: "0f6eb7d9-8e52-467c-9763-0d96f8d7c0ef",
    name: "Daily report",
    cronExpression: "0 9 * * *",
    input: "Generate the daily report",
    enabled: true,
    allowConcurrent: false,
    timezone: "UTC",
    maxRetries: 3,
    createdAt: "2026-03-12T00:00:00.000Z",
    updatedAt: "2026-03-12T00:00:00.000Z",
    lastRunAt: "2026-03-12T01:00:00.000Z",
    nextRunAt: "2026-03-13T09:00:00.000Z",
  };
  it("accepts a persisted scheduled job", () => {
    const result = ScheduledJobSchema.safeParse(validJob);
    expect(result.success).toBe(true);
  });
  it("rejects a job without timestamps", () => {
    const { createdAt, ...invalidJob } = validJob;
    const result = ScheduledJobSchema.safeParse(invalidJob);
    expect(result.success).toBe(false);
  });
});
describe("scheduler job input schemas", () => {
  it("accepts valid create payloads", () => {
    const result = CreateScheduledJobSchema.safeParse({
      agentId: "0f6eb7d9-8e52-467c-9763-0d96f8d7c0ef",
      name: "Nightly digest",
      cronExpression: "0 0 * * *",
      input: "Build the nightly digest",
      allowConcurrent: false,
      timezone: "Asia/Shanghai",
      maxRetries: 2,
    });
    expect(result.success).toBe(true);
  });
  it("accepts partial update payloads", () => {
    const result = UpdateScheduledJobSchema.safeParse({
      enabled: false,
      timezone: "America/New_York",
    });
    expect(result.success).toBe(true);
  });
});
describe("repository interfaces", () => {
  it("exports repository contract types", () => {
    type HasAgentCreate = IAgentRepository["create"];
    type HasRunCreate = IRunRepository["create"];
    type HasMessageAppend = IMessageRepository["append"];
    type HasJobCreate = IJobRepository["create"];
    type HasExecutionCreate = IExecutionRepository["create"];

    expectTypeOf<HasAgentCreate>().toBeFunction();
    expectTypeOf<HasRunCreate>().toBeFunction();
    expectTypeOf<HasMessageAppend>().toBeFunction();
    expectTypeOf<HasJobCreate>().toBeFunction();
    expectTypeOf<HasExecutionCreate>().toBeFunction();
  });
});

describe("ToolResultSchema approval flow", () => {
  it("parses an approval-required tool result", () => {
    const result = ToolResultSchema.safeParse({
      toolCallId: "tc-approval",
      success: false,
      error: "Approval required to access this path.",
      approvalRequired: true,
      approvalRequestId: "approval-1",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.approvalRequired).toBe(true);
      expect(result.data.approvalRequestId).toBe("approval-1");
    }
  });
});
