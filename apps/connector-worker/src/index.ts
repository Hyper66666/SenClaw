import { type Server, createServer } from "node:http";
import { pathToFileURL } from "node:url";

export const appId = "connector-worker";
export const defaultPort = 4300;

const supportedPlatforms = ["windows", "linux"] as const;

export interface AppDescriptor {
  id: typeof appId;
  runtime: "typescript";
  supportedPlatforms: Array<(typeof supportedPlatforms)[number]>;
  defaultPort: number;
}

export const createConnectorWorkerDescriptor = (): AppDescriptor => ({
  id: appId,
  runtime: "typescript",
  supportedPlatforms: [...supportedPlatforms],
  defaultPort,
});

const resolvePort = (): number => {
  const rawPort = process.env.SENCLAW_CONNECTOR_WORKER_PORT;
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
  const descriptor = createConnectorWorkerDescriptor();
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
    console.log(`[connector-worker:main] listening on ${port}`);
  });

  return server;
};

if (isMainModule()) {
  startServer();
}
