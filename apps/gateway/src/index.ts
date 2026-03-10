import { pathToFileURL } from "node:url";

export { createServer, startServer } from "./server.js";

const isMainModule = (): boolean => {
  const entryPoint = process.argv[1];
  return entryPoint
    ? import.meta.url === pathToFileURL(entryPoint).href
    : false;
};

if (isMainModule()) {
  const { startServer } = await import("./server.js");
  startServer().catch((error) => {
    console.error("Failed to start gateway:", error);
    process.exit(1);
  });
}
