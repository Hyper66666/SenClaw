import { once } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  appId,
  createSchedulerDescriptor,
  createTaskGatewayClient,
  defaultPort,
  startServer,
} from "../src/index";

describe("scheduler", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("exposes the expected descriptor", () => {
    expect(appId).toBe("scheduler");
    expect(defaultPort).toBe(4500);
    expect(createSchedulerDescriptor()).toEqual({
      id: "scheduler",
      runtime: "typescript",
      supportedPlatforms: ["windows", "linux"],
      defaultPort: 4500,
    });
  });

  it("submits tasks to the gateway with a bearer token", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ id: "run-1", status: "pending" }), {
        status: 201,
        headers: { "content-type": "application/json" },
      });
    });

    const client = createTaskGatewayClient({
      apiKey: "sk-scheduler",
      baseUrl: "http://127.0.0.1:4100",
      fetch: fetchMock as typeof fetch,
    });

    await expect(
      client.submitTask("agent-1", "run once"),
    ).resolves.toMatchObject({
      id: "run-1",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:4100/api/v1/tasks",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer sk-scheduler",
          "Content-Type": "application/json",
        }),
      }),
    );
  });

  it("exposes scheduler health with pending jobs", async () => {
    const runtime = {
      close: vi.fn(),
      getHealth: vi.fn(async () => ({
        pendingJobs: 2,
        status: "healthy" as const,
      })),
    };

    const server = startServer({
      port: 0,
      runtime: runtime as never,
    });
    await once(server, "listening");

    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Server did not bind to a TCP port");
    }

    const response = await fetch(`http://127.0.0.1:${address.port}/health`);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      pendingJobs: 2,
      status: "healthy",
    });

    server.close();
    await once(server, "close");
    expect(runtime.close).toHaveBeenCalledTimes(1);
  });
});
