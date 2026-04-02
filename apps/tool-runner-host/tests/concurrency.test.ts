import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import { z } from "zod/v4";
import { ToolRegistry } from "../src/index.js";

describe("ToolRegistry batch orchestration", () => {
  it("runs concurrency-safe tools in parallel batches", async () => {
    const registry = new ToolRegistry(1000);

    registry.register(
      {
        name: "safe-a",
        description: "Safe A",
        inputSchema: z.object({ value: z.string() }),
        concurrency: { safe: true },
      },
      async (args) => {
        await new Promise((resolve) => setTimeout(resolve, 120));
        return `A:${args.value}`;
      },
    );
    registry.register(
      {
        name: "safe-b",
        description: "Safe B",
        inputSchema: z.object({ value: z.string() }),
        concurrency: { safe: true },
      },
      async (args) => {
        await new Promise((resolve) => setTimeout(resolve, 120));
        return `B:${args.value}`;
      },
    );

    const startedAt = performance.now();
    const results = await registry.executeTools([
      { toolCallId: "tc-a", toolName: "safe-a", args: { value: "one" } },
      { toolCallId: "tc-b", toolName: "safe-b", args: { value: "two" } },
    ]);
    const durationMs = performance.now() - startedAt;

    expect(results).toEqual([
      { toolCallId: "tc-a", success: true, content: "A:one" },
      { toolCallId: "tc-b", success: true, content: "B:two" },
    ]);
    expect(durationMs).toBeLessThan(220);
  });

  it("keeps non-safe tools serialized by default", async () => {
    const registry = new ToolRegistry(1000);
    const events: string[] = [];

    registry.register(
      {
        name: "serial-a",
        description: "Serial A",
        inputSchema: z.object({}),
      },
      async () => {
        events.push("a:start");
        await new Promise((resolve) => setTimeout(resolve, 50));
        events.push("a:end");
        return "a";
      },
    );
    registry.register(
      {
        name: "serial-b",
        description: "Serial B",
        inputSchema: z.object({}),
      },
      async () => {
        events.push("b:start");
        await new Promise((resolve) => setTimeout(resolve, 50));
        events.push("b:end");
        return "b";
      },
    );

    const results = await registry.executeTools([
      { toolCallId: "tc-a", toolName: "serial-a", args: {} },
      { toolCallId: "tc-b", toolName: "serial-b", args: {} },
    ]);

    expect(results.map((result) => result.content)).toEqual(["a", "b"]);
    expect(events).toEqual(["a:start", "a:end", "b:start", "b:end"]);
  });

  it("cancels concurrent siblings when a tool opts into batch cancellation", async () => {
    const registry = new ToolRegistry(1000);

    registry.register(
      {
        name: "fail-fast",
        description: "Fails and cancels siblings",
        inputSchema: z.object({}),
        concurrency: { safe: true, cancelSiblingsOnFailure: true },
      },
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        throw new Error("boom");
      },
    );
    registry.register(
      {
        name: "cancellable",
        description: "Observes abort signal",
        inputSchema: z.object({}),
        concurrency: { safe: true },
      },
      (_args, context) =>
        new Promise((resolve, reject) => {
          const timer = setTimeout(() => resolve("unexpected"), 500);
          context?.signal.addEventListener(
            "abort",
            () => {
              clearTimeout(timer);
              reject(new Error("Tool batch cancelled due to sibling failure"));
            },
            { once: true },
          );
        }),
    );

    const results = await registry.executeTools([
      { toolCallId: "tc-fail", toolName: "fail-fast", args: {} },
      { toolCallId: "tc-cancel", toolName: "cancellable", args: {} },
    ]);

    expect(results[0]).toMatchObject({
      toolCallId: "tc-fail",
      success: false,
      error: "boom",
    });
    expect(results[1]).toMatchObject({
      toolCallId: "tc-cancel",
      success: false,
      error: "Tool batch cancelled due to sibling failure",
    });
  });
});
