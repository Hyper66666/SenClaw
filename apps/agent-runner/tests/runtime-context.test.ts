import { describe, expect, it } from "vitest";
import {
  createSubagentContext,
  type AgentRuntimeContext,
} from "../src/runtime-context.js";

function createParentContext(): AgentRuntimeContext {
  return {
    runtimeId: "runtime-parent",
    agent: {
      id: "agent-parent",
      name: "Parent Agent",
      systemPrompt: "Be helpful",
      provider: { provider: "openai", model: "gpt-4o" },
      tools: ["echo"],
    },
    messages: [
      { role: "system", content: "You are helpful" },
      { role: "user", content: "Inspect the repository" },
    ],
    cwd: "D:/senclaw",
    link: { parentRunId: "run-root", agentTaskId: "task-root" },
    abortController: new AbortController(),
    toolDecisionCache: new Map([["echo", true]]),
    responseLength: "medium",
    metadata: { requestedBy: "coordinator" },
  };
}

describe("createSubagentContext", () => {
  it("isolates mutable state by default", () => {
    const parent = createParentContext();
    const child = createSubagentContext(parent, {
      runtimeId: "runtime-child",
    });

    expect(child.runtimeId).toBe("runtime-child");
    expect(child.abortController).not.toBe(parent.abortController);
    expect(child.toolDecisionCache).not.toBe(parent.toolDecisionCache);
    expect(child.toolDecisionCache.get("echo")).toBe(true);
    expect(child.responseLength).toBe(parent.responseLength);
    expect(child.messages).not.toBe(parent.messages);
    expect(child.messages).toEqual(parent.messages);
  });

  it("supports explicit sharing for selected runtime state", () => {
    const parent = createParentContext();
    const child = createSubagentContext(parent, {
      shareAbortController: true,
      shareToolDecisionCache: true,
      shareResponseLength: true,
    });

    expect(child.abortController).toBe(parent.abortController);
    expect(child.toolDecisionCache).toBe(parent.toolDecisionCache);
    expect(child.responseLength).toBe(parent.responseLength);
  });

  it("applies explicit overrides without mutating the parent", () => {
    const parent = createParentContext();
    const child = createSubagentContext(parent, {
      agent: {
        ...parent.agent,
        id: "agent-child",
        name: "Child Agent",
      },
      messages: [{ role: "user", content: "Only child prompt" }],
      cwd: "D:/other",
      responseLength: "short",
      metadata: { requestedBy: "worker" },
    });

    expect(child.agent.id).toBe("agent-child");
    expect(child.messages).toEqual([
      { role: "user", content: "Only child prompt" },
    ]);
    expect(child.cwd).toBe("D:/other");
    expect(child.responseLength).toBe("short");
    expect(parent.agent.id).toBe("agent-parent");
    expect(parent.cwd).toBe("D:/senclaw");
    expect(parent.responseLength).toBe("medium");
  });

  it("rejects conflicting sharing combinations", () => {
    const parent = createParentContext();

    expect(() =>
      createSubagentContext(parent, {
        shareAbortController: true,
        abortController: new AbortController(),
      }),
    ).toThrow(/abortController/);

    expect(() =>
      createSubagentContext(parent, {
        shareToolDecisionCache: true,
        toolDecisionCache: new Map(),
      }),
    ).toThrow(/toolDecisionCache/);

    expect(() =>
      createSubagentContext(parent, {
        shareResponseLength: true,
        responseLength: "long",
      }),
    ).toThrow(/responseLength/);
  });
});
