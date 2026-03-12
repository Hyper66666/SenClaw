import {
  type IncomingMessage,
  type Server,
  type ServerResponse,
  createServer,
} from "node:http";
import { pathToFileURL } from "node:url";
import { type SenclawConfig, loadConfig } from "@senclaw/config";
import { createChildLogger, createLogger } from "@senclaw/logging";
import { SchedulerService } from "@senclaw/scheduler";
import { type StorageBundle, createStorage } from "@senclaw/storage";

export const appId = "scheduler";
export const defaultPort = 4500;

const supportedPlatforms = ["windows", "linux"] as const;
const okStatusCode = 200;
const unhealthyStatusCode = 503;

type HealthStatus = "healthy" | "degraded" | "unhealthy";
type TaskGatewayResponse = { id: string };

type TaskGatewayClient = {
  submitTask(agentId: string, input: string): Promise<TaskGatewayResponse>;
};

export interface AppDescriptor {
  id: typeof appId;
  runtime: "typescript";
  supportedPlatforms: Array<(typeof supportedPlatforms)[number]>;
  defaultPort: number;
}

export interface SchedulerHealth {
  status: HealthStatus;
  pendingJobs: number;
  detail?: string;
}

export interface SchedulerRuntime {
  getHealth(): Promise<SchedulerHealth>;
  close(): void;
}

export interface CreateTaskGatewayClientOptions {
  baseUrl: string;
  apiKey: string;
  fetch?: typeof fetch;
}

export interface CreateSchedulerRuntimeOptions {
  config?: SenclawConfig;
  gatewayApiKey?: string;
  gatewayBaseUrl?: string;
  agentService?: TaskGatewayClient;
  logger?: ReturnType<typeof createLogger>;
  storage?: StorageBundle;
  fetch?: typeof fetch;
}

export interface StartServerOptions {
  port?: number;
  runtime?: SchedulerRuntime;
}

export const createSchedulerDescriptor = (): AppDescriptor => ({
  id: appId,
  runtime: "typescript",
  supportedPlatforms: [...supportedPlatforms],
  defaultPort,
});

function resolvePort(): number {
  const rawPort = process.env.SENCLAW_SCHEDULER_PORT;
  const parsedPort = rawPort ? Number(rawPort) : defaultPort;

  return Number.isFinite(parsedPort) ? parsedPort : defaultPort;
}

function isMainModule(): boolean {
  const entryPoint = process.argv[1];
  return entryPoint
    ? import.meta.url === pathToFileURL(entryPoint).href
    : false;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
}

function resolveGatewayBaseUrl(
  config: SenclawConfig,
  override?: string,
): string {
  return normalizeBaseUrl(
    override ??
      process.env.SENCLAW_GATEWAY_URL ??
      `http://127.0.0.1:${config.gatewayPort}`,
  );
}

function resolveGatewayApiKey(override?: string): string {
  const apiKey =
    override ??
    process.env.SENCLAW_SCHEDULER_API_KEY ??
    process.env.SENCLAW_API_KEY;

  if (!apiKey) {
    throw new Error(
      "Scheduler API key is required. Set SENCLAW_SCHEDULER_API_KEY or SENCLAW_API_KEY.",
    );
  }

  return apiKey;
}

function jsonHeaders(): Record<string, string> {
  return { "content-type": "application/json" };
}

function sendJson(
  response: ServerResponse,
  statusCode: number,
  payload: unknown,
): void {
  response.writeHead(statusCode, jsonHeaders());
  response.end(JSON.stringify(payload, null, 2));
}

function resolveRequestPath(request: IncomingMessage): string {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  return url.pathname;
}

function resolveActivePort(server: Server, fallbackPort: number): number {
  const address = server.address();
  return address && typeof address !== "string" ? address.port : fallbackPort;
}

export function createTaskGatewayClient(
  options: CreateTaskGatewayClientOptions,
): TaskGatewayClient {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const requestFetch = options.fetch ?? fetch;

  return {
    async submitTask(
      agentId: string,
      input: string,
    ): Promise<TaskGatewayResponse> {
      const response = await requestFetch(`${baseUrl}/api/v1/tasks`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ agentId, input }),
      });

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => undefined);
        const message =
          errorPayload &&
          typeof errorPayload === "object" &&
          "message" in errorPayload &&
          typeof errorPayload.message === "string"
            ? errorPayload.message
            : `HTTP ${response.status}`;
        throw new Error(message);
      }

      return (await response.json()) as TaskGatewayResponse;
    },
  };
}

export function createSchedulerRuntime(
  options: CreateSchedulerRuntimeOptions = {},
): SchedulerRuntime {
  const config = options.config ?? loadConfig();
  const logger = options.logger ?? createLogger("scheduler", config.logLevel);
  const storage = options.storage ?? createStorage(config.dbUrl ?? ":memory:");
  const agentService =
    options.agentService ??
    createTaskGatewayClient({
      apiKey: resolveGatewayApiKey(options.gatewayApiKey),
      baseUrl: resolveGatewayBaseUrl(config, options.gatewayBaseUrl),
      fetch: options.fetch,
    });

  const scheduler = new SchedulerService(
    agentService,
    storage.jobs,
    storage.executions,
    {
      tickIntervalMs: config.schedulerTickIntervalMs,
      logger: createChildLogger(logger, { component: "scheduler" }),
    },
  );
  scheduler.start();

  let closed = false;

  return {
    async getHealth(): Promise<SchedulerHealth> {
      try {
        const health = await storage.healthCheck.check();
        if (health.status !== "healthy") {
          return {
            status: health.status,
            pendingJobs: 0,
            detail: health.detail,
          };
        }

        const pendingJobs = (await storage.jobs.findDueJobs(new Date())).length;
        return {
          status: "healthy",
          pendingJobs,
        };
      } catch (error) {
        return {
          status: "unhealthy",
          pendingJobs: 0,
          detail: error instanceof Error ? error.message : String(error),
        };
      }
    },
    close(): void {
      if (closed) {
        return;
      }
      closed = true;
      scheduler.stop();
      storage.close();
    },
  };
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  server: Server,
  port: number,
  runtime: SchedulerRuntime,
): Promise<void> {
  const path = resolveRequestPath(request);

  if (request.method === "GET" && path === "/health") {
    const health = await runtime.getHealth();
    sendJson(
      response,
      health.status === "unhealthy" ? unhealthyStatusCode : okStatusCode,
      health,
    );
    return;
  }

  if (request.method === "GET" && path === "/") {
    sendJson(response, okStatusCode, {
      ...createSchedulerDescriptor(),
      activePort: resolveActivePort(server, port),
      status: "ready",
    });
    return;
  }

  sendJson(response, 404, {
    error: "NOT_FOUND",
    message: "Route not found",
  });
}

export function startServer(options: StartServerOptions = {}): Server {
  const port = options.port ?? resolvePort();
  const runtime = options.runtime ?? createSchedulerRuntime();

  const server = createServer((request, response) => {
    void handleRequest(request, response, server, port, runtime);
  });

  server.on("close", () => {
    runtime.close();
  });

  server.listen(port, () => {
    console.log(
      `[scheduler:main] listening on ${resolveActivePort(server, port)}`,
    );
  });

  return server;
}

if (isMainModule()) {
  const server = startServer();
  const shutdown = () => {
    server.close();
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}
