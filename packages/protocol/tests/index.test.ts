import { describe, expect, expectTypeOf, it } from "vitest";
import {
  AgentSchema,
  CreateAgentSchema,
  type IAgentRepository,
  type IMessageRepository,
  MessageSchema,
  type IRunRepository,
  ProviderConfigSchema,
  RunSchema,
  TaskSchema,
  ToolResultSchema,
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

describe("repository interfaces", () => {
  it("exports repository contract types", () => {
    type HasAgentCreate = IAgentRepository["create"];
    type HasRunCreate = IRunRepository["create"];
    type HasMessageAppend = IMessageRepository["append"];

    expectTypeOf<HasAgentCreate>().toBeFunction();
    expectTypeOf<HasRunCreate>().toBeFunction();
    expectTypeOf<HasMessageAppend>().toBeFunction();
  });
});
