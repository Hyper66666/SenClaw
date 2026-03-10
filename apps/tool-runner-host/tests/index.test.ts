import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { InMemorySpanExporter } from "@opentelemetry/sdk-trace-base";
import { z } from "zod/v4";
import {
  getMetricsRegistry,
  initializeTracing,
  resetMetricsRegistry,
  shutdownTracing,
} from "@senclaw/observability";
import { ToolRegistry, registerBuiltinTools } from "../src/index.js";

async function waitForFinishedSpans(
  exporter: InMemorySpanExporter,
  expectedCount: number,
) {
  const deadline = Date.now() + 1_000;
  while (Date.now() < deadline) {
    const spans = exporter.getFinishedSpans();
    if (spans.length >= expectedCount) {
      return spans;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  return exporter.getFinishedSpans();
}

describe("ToolRegistry", () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry(1000);
    resetMetricsRegistry();
  });

  afterEach(async () => {
    await shutdownTracing();
  });

  const testTool = {
    name: "greet",
    description: "Greets someone",
    inputSchema: z.object({ name: z.string() }),
  };

  describe("register", () => {
    it("registers a tool successfully", () => {
      registry.register(testTool, (args) => `Hello, ${args.name}!`);
      expect(registry.getTool("greet")).toBeDefined();
    });

    it("rejects duplicate tool names", () => {
      registry.register(testTool, (args) => `Hello, ${args.name}!`);
      expect(() =>
        registry.register(testTool, (args) => `Hi, ${args.name}!`),
      ).toThrow('Tool "greet" is already registered');
    });
  });

  describe("listTools", () => {
    it("returns all registered tool definitions", () => {
      registry.register(testTool, (args) => `Hello, ${args.name}!`);
      const tools = registry.listTools();
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe("greet");
      expect(tools[0].description).toBe("Greets someone");
    });
  });

  describe("executeTool", () => {
    beforeEach(() => {
      registry.register(testTool, (args) => `Hello, ${args.name}!`);
    });

    it("executes with valid input", async () => {
      const result = await registry.executeTool("tc-1", "greet", {
        name: "World",
      });
      expect(result).toEqual({
        toolCallId: "tc-1",
        success: true,
        content: "Hello, World!",
      });
    });

    it("returns error for unknown tool", async () => {
      const result = await registry.executeTool("tc-2", "unknown", {});
      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });

    it("returns validation error for invalid input", async () => {
      const result = await registry.executeTool("tc-3", "greet", {});
      expect(result.success).toBe(false);
      expect(result.error).toContain("Validation failed");
    });

    it("catches handler exceptions", async () => {
      registry.register(
        {
          name: "fail",
          description: "Always fails",
          inputSchema: z.object({}),
        },
        () => {
          throw new Error("Boom");
        },
      );
      const result = await registry.executeTool("tc-4", "fail", {});
      expect(result.success).toBe(false);
      expect(result.error).toBe("Boom");
    });

    it("enforces execution timeout", async () => {
      registry.register(
        {
          name: "slow",
          description: "Takes too long",
          inputSchema: z.object({}),
        },
        () => new Promise((resolve) => setTimeout(() => resolve("done"), 5000)),
      );
      const result = await registry.executeTool("tc-5", "slow", {});
      expect(result.success).toBe(false);
      expect(result.error).toBe("Tool execution timed out");
    });

    it("records tool call metrics for success and failure cases", async () => {
      await registry.executeTool("tc-6", "greet", { name: "Metrics" });
      await registry.executeTool("tc-7", "unknown", {});

      const output = await getMetricsRegistry().metrics();
      expect(output).toContain(
        'tool_calls_total{tool_name="greet",status="success"} 1',
      );
      expect(output).toContain(
        'tool_calls_total{tool_name="unknown",status="failed"} 1',
      );
      expect(output).toContain("tool_call_duration_seconds_bucket");
      expect(output).toContain('tool_name="greet"');
    });

    it("exports a tool.execute span with tool attributes", async () => {
      const exporter = new InMemorySpanExporter();
      await initializeTracing({
        serviceName: "tool-runner-test",
        enabled: true,
        exporter,
        autoInstrumentations: false,
      });

      await registry.executeTool("tc-trace", "greet", { name: "Trace" });

      const spans = await waitForFinishedSpans(exporter, 1);
      expect(
        spans.some(
          (span) =>
            span.name === "tool.execute" &&
            span.attributes["tool.name"] === "greet",
        ),
      ).toBe(true);
    });

    it("executes sandboxed tools in a child process", async () => {
      registry.register(
        {
          name: "sandboxed-greet",
          description: "Greets from a child process",
          inputSchema: z.object({ name: z.string() }),
          sandbox: { level: 1, timeout: 500, maxMemory: 64 },
        },
        (args) => `Hello, ${args.name} from ${process.pid}`,
      );

      const result = await registry.executeTool("tc-8", "sandboxed-greet", {
        name: "Sandbox",
      });
      expect(result.success).toBe(true);
      expect(result.content).toContain("Hello, Sandbox from ");
      expect(result.content).not.toContain(String(process.pid));
    });

    it("times out sandboxed tools without crashing the parent", async () => {
      registry.register(
        {
          name: "sandboxed-slow",
          description: "Sleeps in a child process",
          inputSchema: z.object({}),
          sandbox: { level: 1, timeout: 50, maxMemory: 64 },
        },
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 250));
          return "done";
        },
      );

      const result = await registry.executeTool("tc-9", "sandboxed-slow", {});
      expect(result.success).toBe(false);
      expect(result.error).toBe("Tool execution timed out");

      const followUp = await registry.executeTool("tc-10", "greet", {
        name: "Still alive",
      });
      expect(followUp.success).toBe(true);
    });

    it("reports sandboxed tool crashes as errors", async () => {
      registry.register(
        {
          name: "sandboxed-crash",
          description: "Crashes in a child process",
          inputSchema: z.object({}),
          sandbox: { level: 1, timeout: 500, maxMemory: 64 },
        },
        () => {
          process.exit(1);
        },
      );

      const result = await registry.executeTool("tc-11", "sandboxed-crash", {});
      expect(result.success).toBe(false);
      expect(result.error).toContain("exited with code 1");
    });

    it("maps sandboxed out-of-memory failures to a readable error", async () => {
      registry.register(
        {
          name: "sandboxed-oom",
          description: "Allocates until V8 hits the heap limit",
          inputSchema: z.object({}),
          sandbox: { level: 1, timeout: 1000, maxMemory: 16 },
        },
        () => {
          const chunks: number[][] = [];
          while (true) {
            chunks.push(new Array(100_000).fill(Math.random()));
          }
        },
      );

      const result = await registry.executeTool("tc-12", "sandboxed-oom", {});
      expect(result.success).toBe(false);
      expect(result.error).toContain("memory limit");
    });
  });

  describe("exportForAISdk", () => {
    it("exports tools in AI SDK format", () => {
      registry.register(testTool, (args) => `Hello, ${args.name}!`);
      const exported = registry.exportForAISdk();
      expect(exported.greet).toBeDefined();
      expect(exported.greet.description).toBe("Greets someone");
      expect(exported.greet.parameters).toBeDefined();
    });
  });
});

describe("Built-in echo tool", () => {
  it("returns input message as-is", async () => {
    const registry = new ToolRegistry();
    registerBuiltinTools(registry);

    const result = await registry.executeTool("tc-echo", "echo", {
      message: "hello",
    });
    expect(result).toEqual({
      toolCallId: "tc-echo",
      success: true,
      content: "hello",
    });
  });
});
