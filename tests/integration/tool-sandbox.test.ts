import { type Server, createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod/v4";
import { ToolRegistry } from "../../apps/tool-runner-host/src/index.js";

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

describe("Tool sandbox integration", () => {
  let registry: ToolRegistry;
  let servers: Server[];

  beforeEach(() => {
    registry = new ToolRegistry(1_000);
    servers = [];
    registry.register(
      {
        name: "plain-greet",
        description: "Returns a greeting",
        inputSchema: z.object({ name: z.string() }),
      },
      (args) => `Hello, ${args.name}!`,
    );
  });

  afterEach(async () => {
    await Promise.all(servers.map((server) => stopServer(server)));
  });

  it("returns a memory limit error and keeps the host available", async () => {
    registry.register(
      {
        name: "sandboxed-oom-integration",
        description: "Allocates until V8 hits the heap limit",
        inputSchema: z.object({}),
        sandbox: { level: 1, timeout: 1_000, maxMemory: 16 },
      },
      () => {
        const chunks: number[][] = [];
        while (true) {
          chunks.push(new Array(100_000).fill(Math.random()));
        }
      },
    );

    const result = await registry.executeTool(
      "int-oom",
      "sandboxed-oom-integration",
      {},
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain("memory limit");

    const followUp = await registry.executeTool(
      "int-oom-follow-up",
      "plain-greet",
      {
        name: "after oom",
      },
    );
    expect(followUp.success).toBe(true);
    expect(followUp.content).toBe("Hello, after oom!");
  });

  it("returns a timeout error and keeps the host available", async () => {
    registry.register(
      {
        name: "sandboxed-timeout-integration",
        description: "Sleeps past the timeout",
        inputSchema: z.object({}),
        sandbox: { level: 1, timeout: 50, maxMemory: 64 },
      },
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 250));
        return "done";
      },
    );

    const result = await registry.executeTool(
      "int-timeout",
      "sandboxed-timeout-integration",
      {},
    );
    expect(result.success).toBe(false);
    expect(result.error).toBe("Tool execution timed out");

    const followUp = await registry.executeTool(
      "int-timeout-follow-up",
      "plain-greet",
      {
        name: "after timeout",
      },
    );
    expect(followUp.success).toBe(true);
    expect(followUp.content).toBe("Hello, after timeout!");
  });

  it("returns a crash error and keeps the host available", async () => {
    registry.register(
      {
        name: "sandboxed-crash-integration",
        description: "Crashes the child process",
        inputSchema: z.object({}),
        sandbox: { level: 1, timeout: 500, maxMemory: 64 },
      },
      () => {
        process.exit(1);
      },
    );

    const result = await registry.executeTool(
      "int-crash",
      "sandboxed-crash-integration",
      {},
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain("exited with code 1");

    const followUp = await registry.executeTool(
      "int-crash-follow-up",
      "plain-greet",
      {
        name: "after crash",
      },
    );
    expect(followUp.success).toBe(true);
    expect(followUp.content).toBe("Hello, after crash!");
  });

  it("blocks network access when allowNetwork is false", async () => {
    const { server, port } = await startTestServer();
    servers.push(server);

    registry.register(
      {
        name: "sandboxed-network-block-integration",
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
      "int-network",
      "sandboxed-network-block-integration",
      {
        url: `http://127.0.0.1:${port}`,
      },
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain("Network access is disabled");

    const followUp = await registry.executeTool(
      "int-network-follow-up",
      "plain-greet",
      {
        name: "after network block",
      },
    );
    expect(followUp.success).toBe(true);
    expect(followUp.content).toBe("Hello, after network block!");
  });
});
