import { describe, expect, it } from "vitest";
import {
  AgentSchema,
  MessageSchema,
  RunSchema,
  TaskSchema,
  ToolResultSchema,
} from "../../packages/protocol/src/index";

describe("workspace contracts", () => {
  it("protocol exports all core schemas", () => {
    expect(AgentSchema).toBeDefined();
    expect(TaskSchema).toBeDefined();
    expect(RunSchema).toBeDefined();
    expect(MessageSchema).toBeDefined();
    expect(ToolResultSchema).toBeDefined();
  });

  it("protocol schemas are valid Zod schemas", () => {
    const agent = AgentSchema.safeParse({
      id: "test",
      name: "Test",
      systemPrompt: "Hello",
      provider: { provider: "openai", model: "gpt-4o" },
      tools: [],
    });
    expect(agent.success).toBe(true);
  });
});
