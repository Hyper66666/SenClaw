import { describe, expect, it } from "vitest";
import { AgentDefinitionSchema } from "../src/index.js";

describe("AgentDefinitionSchema", () => {
  it("applies declarative defaults for runtime-specific fields", () => {
    const result = AgentDefinitionSchema.safeParse({
      name: "Research Agent",
      systemPrompt: "Research deeply",
      provider: { provider: "openai", model: "gpt-4o-mini" },
      tools: ["echo"],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toMatchObject({
        effort: "medium",
        isolation: "shared",
        permissionMode: "default",
        background: false,
      });
    }
  });

  it("accepts explicit runtime overrides", () => {
    const result = AgentDefinitionSchema.safeParse({
      name: "Background Agent",
      systemPrompt: "Work in the background",
      provider: { provider: "openai", model: "gpt-4o" },
      tools: ["echo", "shell.exec"],
      effort: "high",
      isolation: "isolated",
      permissionMode: "managed",
      maxTurns: 12,
      background: true,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.maxTurns).toBe(12);
      expect(result.data.background).toBe(true);
    }
  });
});
