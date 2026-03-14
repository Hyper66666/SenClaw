import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { type Server, createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { InMemorySpanExporter } from "@opentelemetry/sdk-trace-base";
import {
  getMetricsRegistry,
  initializeTracing,
  resetMetricsRegistry,
  shutdownTracing,
} from "@senclaw/observability";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod/v4";
import {
  SandboxedToolRunner,
  ToolRegistry,
  registerBuiltinTools,
} from "../src/index.js";

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

async function startTestServer(responseBody = "network-ok") {
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/plain" });
    response.end(responseBody);
  });

  const port = await new Promise<number>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Expected TCP server address"));
        return;
      }

      resolve((address as AddressInfo).port);
    });
  });

  return { server, port };
}

function stopServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function supportsCpuProbe(): Promise<boolean> {
  if (process.platform !== "win32") {
    return true;
  }

  return await new Promise((resolve) => {
    const probe = spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        "$process = Get-Process -Id 13116 -ErrorAction SilentlyContinue; if ($null -ne $process) { Write-Output $process.CPU }",
      ],
      {
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      },
    );

    probe.once("error", () => resolve(false));
    probe.once("exit", (code) => resolve(code === 0));
  });
}

describe("ToolRegistry", () => {
  let registry: ToolRegistry;
  let fixturePaths: string[];
  let networkServers: Server[];

  beforeEach(() => {
    registry = new ToolRegistry(1000);
    resetMetricsRegistry();
    fixturePaths = [];
    networkServers = [];
  });

  afterEach(async () => {
    await Promise.all(networkServers.map((server) => stopServer(server)));
    await Promise.all(
      fixturePaths.map((path) => rm(path, { recursive: true, force: true })),
    );
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

    it("enforces maxCpu limits for sandboxed tools", async () => {
      if (!(await supportsCpuProbe())) {
        return;
      }

      registry.register(
        {
          name: "sandboxed-cpu-limit",
          description: "Consumes CPU beyond the configured budget",
          inputSchema: z.object({}),
          sandbox: { level: 1, timeout: 2000, maxMemory: 64, maxCpu: 10 },
        },
        () => {
          const deadline = Date.now() + 1500;
          while (Date.now() < deadline) {
            Math.sqrt(Math.random());
          }
          return "unexpected";
        },
      );

      const result = await registry.executeTool(
        "tc-12b",
        "sandboxed-cpu-limit",
        {},
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain("CPU limit");
    });

    it("routes level 4 tools through the Rust sandbox runner contract", async () => {
      const runnerDir = await mkdtemp(join(tmpdir(), "senclaw-rust-runner-"));
      fixturePaths.push(runnerDir);
      const fakeRunnerPath = join(runnerDir, "fake-rust-runner.cjs");
      await writeFile(
        fakeRunnerPath,
        [
          'let input = "";',
          'process.stdin.setEncoding("utf8");',
          'process.stdin.on("data", (chunk) => { input += chunk; });',
          'process.stdin.on("end", () => {',
          "  const request = JSON.parse(input);",
          "  const response = {",
          "    ok: true,",
          "    result: JSON.stringify({",
          "      sandboxLevel: request.executeMessage.sandboxLevel,",
          "      sandboxDirectory: request.executeMessage.sandboxDirectory,",
          '      hasWorkerSource: request.workerSource.includes("process.on(\\"message\\"") || request.workerSource.includes("process.stdin.on"),',
          "      nodePath: request.nodePath,",
          "    }),",
          "  };",
          "  process.stdout.write(JSON.stringify(response));",
          "});",
        ].join("\n"),
        "utf8",
      );

      registry = new ToolRegistry(
        1000,
        new SandboxedToolRunner({
          defaultTimeoutMs: 1000,
          rustRunner: {
            command: process.execPath,
            args: [fakeRunnerPath],
          },
        }),
      );
      registry.register(testTool, (args) => `Hello, ${args.name}!`);
      registry.register(
        {
          name: "sandboxed-rust-contract",
          description: "Uses the Rust sandbox runner contract",
          inputSchema: z.object({}),
          sandbox: { level: 4, timeout: 500, maxMemory: 64, maxCpu: 50 },
        },
        () => "handled by rust runner",
      );

      const result = await registry.executeTool(
        "tc-12c",
        "sandboxed-rust-contract",
        {},
      );
      expect(result.success).toBe(true);
      const payload = JSON.parse(result.content ?? "{}") as {
        sandboxLevel: number;
        sandboxDirectory: string;
        hasWorkerSource: boolean;
        nodePath: string;
      };
      expect(payload.sandboxLevel).toBe(4);
      expect(payload.hasWorkerSource).toBe(true);
      expect(payload.nodePath).toContain("node");
      expect(payload.sandboxDirectory).toContain("senclaw-sandbox-");
      expect(existsSync(payload.sandboxDirectory)).toBe(false);
    });

    it("surfaces a clear error when the Rust sandbox runner is unavailable", async () => {
      registry = new ToolRegistry(
        1000,
        new SandboxedToolRunner({
          defaultTimeoutMs: 1000,
          rustRunner: {
            command: "definitely-missing-rust-sandbox-runner",
          },
        }),
      );
      registry.register(testTool, (args) => `Hello, ${args.name}!`);
      registry.register(
        {
          name: "sandboxed-rust-missing",
          description: "Fails when the Rust runner is unavailable",
          inputSchema: z.object({}),
          sandbox: { level: 4, timeout: 500, maxMemory: 64, maxCpu: 50 },
        },
        () => "handled by rust runner",
      );

      const result = await registry.executeTool(
        "tc-12d",
        "sandboxed-rust-missing",
        {},
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain("Rust sandbox runner is unavailable");
      expect(result.error).toContain("native/sandbox-runner");
    });

    it("validates Rust sandbox runner CLI contract with actual binary", async () => {
      const { spawn } = await import("node:child_process");
      const { resolve } = await import("node:path");
      const { existsSync } = await import("node:fs");

      // Locate the Rust binary (release or debug build)
      const executableName =
        process.platform === "win32" ? "sandbox-runner.exe" : "sandbox-runner";
      const releasePath = resolve(
        process.cwd(),
        "native",
        "target",
        "release",
        executableName,
      );
      const debugPath = resolve(
        process.cwd(),
        "native",
        "target",
        "debug",
        executableName,
      );

      let runnerPath: string | undefined;
      if (existsSync(releasePath)) {
        runnerPath = releasePath;
      } else if (existsSync(debugPath)) {
        runnerPath = debugPath;
      }

      if (!runnerPath) {
        console.warn(
          "Skipping Rust CLI contract test: binary not found. Run 'cargo build' in native/sandbox-runner/",
        );
        return;
      }

      // Prepare a minimal request matching the SandboxRequest contract
      const request = {
        nodePath: process.execPath,
        workerSource: `
          process.stdin.setEncoding("utf8");
          let input = "";
          process.stdin.on("data", (chunk) => { input += chunk; });
          process.stdin.on("end", () => {
            const message = JSON.parse(input);
            const result = { echo: message.args, level: message.sandboxLevel };
            process.stdout.write(JSON.stringify({ type: "result", result: JSON.stringify(result) }));
          });
        `,
        executeMessage: {
          type: "execute",
          handlerSource: "(args) => args",
          args: { test: "cli-contract" },
          sandboxLevel: 4,
          allowNetwork: false,
          allowedDomains: [],
          allowedPaths: [],
        },
        timeoutMs: 5000,
        maxMemoryMb: 128,
        maxCpu: 100,
      };

      // Spawn the Rust binary and send JSON via stdin
      const child = spawn(runnerPath, [], {
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      });

      let stdout = "";
      let stderr = "";

      child.stdout?.setEncoding("utf8");
      child.stdout?.on("data", (chunk) => {
        stdout += chunk;
      });

      child.stderr?.setEncoding("utf8");
      child.stderr?.on("data", (chunk) => {
        stderr += chunk;
      });

      const exitPromise = new Promise<number | null>((resolve) => {
        child.on("exit", (code) => resolve(code));
      });

      // Write request to stdin
      child.stdin?.end(JSON.stringify(request));

      const exitCode = await exitPromise;

      // Validate CLI contract: stdout contains JSON response with { ok, result }
      expect(exitCode).toBe(0);
      expect(stderr).toBe("");

      const response = JSON.parse(stdout.trim());
      expect(response).toHaveProperty("ok", true);
      expect(response).toHaveProperty("result");

      const result = JSON.parse(response.result);
      expect(result).toHaveProperty("echo");
      expect(result.echo).toEqual({ test: "cli-contract" });
      expect(result.level).toBe(4);
    });

    it("runs level 2 sandboxed tools in a temp working directory and cleans it up", async () => {
      registry.register(
        {
          name: "sandboxed-temp-dir",
          description: "Uses a temp working directory",
          inputSchema: z.object({}),
          sandbox: { level: 2, timeout: 500, maxMemory: 64 },
        },
        async () => {
          const fs = await import("node:fs/promises");
          await fs.writeFile("artifact.txt", "hello from sandbox", "utf8");
          const content = await fs.readFile("artifact.txt", "utf8");
          return JSON.stringify({ cwd: process.cwd(), content });
        },
      );

      const result = await registry.executeTool(
        "tc-13",
        "sandboxed-temp-dir",
        {},
      );
      expect(result.success).toBe(true);
      const payload = JSON.parse(result.content ?? "{}") as {
        cwd: string;
        content: string;
      };
      expect(payload.content).toBe("hello from sandbox");
      expect(payload.cwd).not.toBe(process.cwd());
      expect(payload.cwd).toContain("senclaw-sandbox-");
      expect(existsSync(payload.cwd)).toBe(false);
    });

    it("blocks writes outside the sandbox temp directory for level 2 tools", async () => {
      const fixtureDir = await mkdtemp(join(tmpdir(), "senclaw-fixture-"));
      fixturePaths.push(fixtureDir);
      const blockedFile = join(fixtureDir, "blocked.txt");

      registry.register(
        {
          name: "sandboxed-block-write",
          description: "Attempts to write outside the sandbox",
          inputSchema: z.object({ targetPath: z.string() }),
          sandbox: { level: 2, timeout: 500, maxMemory: 64 },
        },
        async (args) => {
          const fs = await import("node:fs/promises");
          await fs.writeFile(args.targetPath, "should fail", "utf8");
          return "unexpected";
        },
      );

      const result = await registry.executeTool(
        "tc-14",
        "sandboxed-block-write",
        {
          targetPath: blockedFile,
        },
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain("Access denied");
      expect(existsSync(blockedFile)).toBe(false);
    });

    it("allows read-only access to explicitly allowed paths for level 2 tools", async () => {
      const fixtureDir = await mkdtemp(join(tmpdir(), "senclaw-fixture-"));
      fixturePaths.push(fixtureDir);
      const allowedFile = join(fixtureDir, "allowed.txt");
      await writeFile(allowedFile, "allowed-content", "utf8");

      registry.register(
        {
          name: "sandboxed-allowed-read",
          description: "Reads an explicitly allowed file",
          inputSchema: z.object({ filePath: z.string() }),
          sandbox: {
            level: 2,
            timeout: 500,
            maxMemory: 64,
            allowedPaths: [fixtureDir],
          },
        },
        async (args) => {
          const fs = await import("node:fs/promises");
          return fs.readFile(args.filePath, "utf8");
        },
      );

      const result = await registry.executeTool(
        "tc-15",
        "sandboxed-allowed-read",
        {
          filePath: allowedFile,
        },
      );
      expect(result.success).toBe(true);
      expect(result.content).toBe("allowed-content");
    });

    it("blocks reads outside explicitly allowed paths for level 2 tools", async () => {
      const fixtureDir = await mkdtemp(join(tmpdir(), "senclaw-fixture-"));
      fixturePaths.push(fixtureDir);
      const blockedFile = join(fixtureDir, "secret.txt");
      await writeFile(blockedFile, "secret", "utf8");

      registry.register(
        {
          name: "sandboxed-block-read",
          description: "Attempts to read outside allowed paths",
          inputSchema: z.object({ filePath: z.string() }),
          sandbox: { level: 2, timeout: 500, maxMemory: 64 },
        },
        async (args) => {
          const fs = await import("node:fs/promises");
          return fs.readFile(args.filePath, "utf8");
        },
      );

      const result = await registry.executeTool(
        "tc-16",
        "sandboxed-block-read",
        {
          filePath: blockedFile,
        },
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain("Access denied");
    });

    it("blocks http requests when allowNetwork is false", async () => {
      const { server, port } = await startTestServer();
      networkServers.push(server);

      registry.register(
        {
          name: "sandboxed-network-disabled",
          description: "Attempts an outbound http request",
          inputSchema: z.object({ url: z.string() }),
          sandbox: {
            level: 3,
            timeout: 500,
            maxMemory: 64,
            allowNetwork: false,
          },
        },
        (args) =>
          new Promise((resolve, reject) => {
            const http = require("node:http");
            const request = http.get(args.url, (response) => {
              let body = "";
              response.setEncoding("utf8");
              response.on("data", (chunk) => {
                body += chunk;
              });
              response.on("end", () => resolve(body));
            });
            request.on("error", (error) => reject(error));
          }),
      );

      const result = await registry.executeTool(
        "tc-17",
        "sandboxed-network-disabled",
        {
          url: `http://127.0.0.1:${port}`,
        },
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain("Network access is disabled");
    });

    it("blocks http requests to hosts outside allowedDomains", async () => {
      const { server, port } = await startTestServer();
      networkServers.push(server);

      registry.register(
        {
          name: "sandboxed-network-disallowed-host",
          description: "Attempts an http request to a disallowed host",
          inputSchema: z.object({ url: z.string() }),
          sandbox: {
            level: 3,
            timeout: 500,
            maxMemory: 64,
            allowNetwork: true,
            allowedDomains: ["example.com"],
          },
        },
        (args) =>
          new Promise((resolve, reject) => {
            const http = require("node:http");
            const request = http.get(args.url, (response) => {
              let body = "";
              response.setEncoding("utf8");
              response.on("data", (chunk) => {
                body += chunk;
              });
              response.on("end", () => resolve(body));
            });
            request.on("error", (error) => reject(error));
          }),
      );

      const result = await registry.executeTool(
        "tc-18",
        "sandboxed-network-disallowed-host",
        {
          url: `http://127.0.0.1:${port}`,
        },
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain("Network access denied");
    });

    it("allows http requests to hosts listed in allowedDomains", async () => {
      const { server, port } = await startTestServer();
      networkServers.push(server);

      registry.register(
        {
          name: "sandboxed-network-allowed-host",
          description: "Performs an allowed http request",
          inputSchema: z.object({ url: z.string() }),
          sandbox: {
            level: 3,
            timeout: 500,
            maxMemory: 64,
            allowNetwork: true,
            allowedDomains: ["127.0.0.1"],
          },
        },
        (args) =>
          new Promise((resolve, reject) => {
            const http = require("node:http");
            const request = http.get(args.url, (response) => {
              let body = "";
              response.setEncoding("utf8");
              response.on("data", (chunk) => {
                body += chunk;
              });
              response.on("end", () => resolve(body));
            });
            request.on("error", (error) => reject(error));
          }),
      );

      const result = await registry.executeTool(
        "tc-19",
        "sandboxed-network-allowed-host",
        {
          url: `http://127.0.0.1:${port}`,
        },
      );
      expect(result.success).toBe(true);
      expect(result.content).toBe("network-ok");
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
