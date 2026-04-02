import { describe, expect, it } from "vitest";
import { createStorage } from "../src/index.js";

describe("Sqlite run linkage", () => {
  it("persists optional parent run and agent task linkage on new runs", async () => {
    const storage = createStorage(":memory:");

    const run = await storage.runs.create("agent-1", "Hello", {
      parentRunId: "run-parent",
      agentTaskId: "task-1",
    });

    expect(run.parentRunId).toBe("run-parent");
    expect(run.agentTaskId).toBe("task-1");
    await expect(storage.runs.get(run.id)).resolves.toMatchObject({
      parentRunId: "run-parent",
      agentTaskId: "task-1",
    });
  });
});
