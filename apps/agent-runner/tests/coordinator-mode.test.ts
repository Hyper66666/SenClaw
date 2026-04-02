import { describe, expect, it } from "vitest";
import type { Agent } from "@senclaw/protocol";
import {
  COORDINATOR_MODE_PROMPT,
  buildRuntimeSystemPrompt,
  getCoordinatorAllowedToolNames,
  isToolAllowedForAgent,
} from "../src/coordinator-mode.js";

const baseAgent: Agent = {
  id: "agent-1",
  name: "Coordinator",
  systemPrompt: "Coordinate work",
  provider: { provider: "openai", model: "gpt-4o" },
  tools: [],
  effort: "medium",
  isolation: "shared",
  permissionMode: "default",
  mode: "coordinator",
  background: false,
};

describe("coordinator mode helpers", () => {
  it("appends coordinator guidance to the runtime system prompt", () => {
    expect(buildRuntimeSystemPrompt(baseAgent)).toContain(
      COORDINATOR_MODE_PROMPT,
    );
  });

  it("filters coordinator tools to orchestration-safe names", () => {
    const allowed = getCoordinatorAllowedToolNames([
      { name: "agent_tasks.spawn" },
      { name: "agent_tasks.list" },
      { name: "fs.read_text" },
    ]);

    expect(allowed).toEqual(["agent_tasks.spawn", "agent_tasks.list"]);
    expect(isToolAllowedForAgent(baseAgent, "agent_tasks.spawn", allowed)).toBe(
      true,
    );
    expect(isToolAllowedForAgent(baseAgent, "fs.read_text", allowed)).toBe(
      false,
    );
  });

  it("still respects explicit tool allowlists for coordinator agents", () => {
    const allowed = getCoordinatorAllowedToolNames([
      { name: "agent_tasks.spawn" },
      { name: "agent_tasks.list" },
      { name: "agent_tasks.send_message" },
    ]);
    const scopedAgent: Agent = {
      ...baseAgent,
      tools: ["agent_tasks.list"],
    };

    expect(
      isToolAllowedForAgent(scopedAgent, "agent_tasks.list", allowed),
    ).toBe(true);
    expect(
      isToolAllowedForAgent(scopedAgent, "agent_tasks.spawn", allowed),
    ).toBe(false);
  });
});
