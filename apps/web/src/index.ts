import { type Server, createServer } from "node:http";
import { pathToFileURL } from "node:url";

export const appId = "web";
export const defaultPort = 4173;

const supportedPlatforms = ["windows", "linux"] as const;

export interface AppDescriptor {
  id: typeof appId;
  runtime: "typescript";
  supportedPlatforms: Array<(typeof supportedPlatforms)[number]>;
  defaultPort: number;
}

export const createWebDescriptor = (): AppDescriptor => ({
  id: appId,
  runtime: "typescript",
  supportedPlatforms: [...supportedPlatforms],
  defaultPort,
});

export interface CreateApiClientOptions {
  baseUrl?: string;
  apiKey?: string;
  getApiKey?: () => string | undefined;
  fetchImpl?: typeof fetch;
  isProtectedPath?: (path: string) => boolean;
}

export class ApiResponseError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "APIError";
  }
}

export class MissingApiKeyError extends Error {
  constructor(
    message = "Configure a gateway API key in the web console before calling protected endpoints.",
  ) {
    super(message);
    this.name = "MissingApiKeyError";
  }
}

function resolveRequestUrl(path: string, baseUrl?: string): string {
  if (/^https?:\/\//.test(path)) {
    return path;
  }

  if (!baseUrl) {
    return path;
  }

  const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(path.replace(/^\//, ""), normalizedBaseUrl).toString();
}

function isProtectedApiPath(path: string): boolean {
  try {
    const parsed = new URL(path, "http://senclaw.local");
    return parsed.pathname.startsWith("/api/v1/");
  } catch {
    return path.startsWith("/api/v1/");
  }
}

function resolveApiKey(options: CreateApiClientOptions): string | undefined {
  const dynamicApiKey = options.getApiKey?.()?.trim();
  if (dynamicApiKey) {
    return dynamicApiKey;
  }

  const staticApiKey = options.apiKey?.trim();
  return staticApiKey || undefined;
}

async function readJsonPayload(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

export function createApiClient(options: CreateApiClientOptions = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch?.bind(globalThis);
  if (!fetchImpl) {
    throw new Error("Fetch API is not available in this environment");
  }

  return {
    async request<T>(path: string, init: RequestInit = {}): Promise<T> {
      const headers = new Headers(init.headers);
      headers.set("accept", "application/json");
      if (init.body !== undefined && !headers.has("content-type")) {
        headers.set("content-type", "application/json");
      }

      const protectedPath = (options.isProtectedPath ?? isProtectedApiPath)(
        path,
      );
      const apiKey = resolveApiKey(options);
      if (protectedPath) {
        if (!apiKey) {
          throw new MissingApiKeyError();
        }
        headers.set("authorization", `Bearer ${apiKey}`);
      }

      const response = await fetchImpl(
        resolveRequestUrl(path, options.baseUrl),
        {
          ...init,
          headers,
        },
      );

      if (!response.ok) {
        const payload = await readJsonPayload(response);
        const code =
          payload &&
          typeof payload === "object" &&
          "error" in payload &&
          typeof (payload as { error?: unknown }).error === "string"
            ? (payload as { error: string }).error
            : "UNKNOWN_ERROR";
        const message =
          payload &&
          typeof payload === "object" &&
          "message" in payload &&
          typeof (payload as { message?: unknown }).message === "string"
            ? (payload as { message: string }).message
            : response.statusText;
        const details =
          payload && typeof payload === "object" && "details" in payload
            ? (payload as { details?: unknown }).details
            : undefined;

        throw new ApiResponseError(response.status, code, message, details);
      }

      if (response.status === 204) {
        return undefined as T;
      }

      const contentType = response.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        return (await response.json()) as T;
      }

      const text = await response.text();
      return (text === "" ? undefined : text) as T;
    },
  };
}

const resolvePort = (): number => {
  const rawPort = process.env.SENCLAW_WEB_PORT;
  const parsedPort = rawPort ? Number(rawPort) : defaultPort;

  return Number.isFinite(parsedPort) ? parsedPort : defaultPort;
};

const isMainModule = (): boolean => {
  const entryPoint = process.argv[1];
  return entryPoint
    ? import.meta.url === pathToFileURL(entryPoint).href
    : false;
};

export const startServer = (port = resolvePort()): Server => {
  const descriptor = createWebDescriptor();
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify(
        {
          ...descriptor,
          activePort: port,
          status: "ready",
        },
        null,
        2,
      ),
    );
  });

  server.listen(port, () => {
    console.log(`[web:main] listening on ${port}`);
  });

  return server;
};

if (isMainModule()) {
  startServer();
}
