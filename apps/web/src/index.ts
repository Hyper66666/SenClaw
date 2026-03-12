import { type Server, createServer } from "node:http";
import { pathToFileURL } from "node:url";
export {
  ApiResponseError,
  MissingApiKeyError,
  createApiClient,
  type CreateApiClientOptions,
} from "./api-client";

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
