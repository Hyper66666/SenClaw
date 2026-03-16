import { FILESYSTEM_POLICY_SOURCE } from "./sandbox-filesystem.js";
import { NETWORK_POLICY_SOURCE } from "./sandbox-network.js";

export interface ExecuteMessage {
  type: "execute";
  handlerSource: string;
  args: unknown;
  sandboxLevel: number;
  sandboxDirectory?: string;
  allowNetwork: boolean;
  allowedDomains: string[];
  allowedPaths: string[];
}

export interface ReadyMessage {
  type: "ready";
}

export interface ResultMessage {
  type: "result";
  result: string;
}

export interface SandboxErrorMessage {
  type: "error";
  error: string;
}

export function createExecuteMessage(message: ExecuteMessage): ExecuteMessage {
  return {
    type: "execute",
    handlerSource: message.handlerSource,
    args: message.args,
    sandboxLevel: message.sandboxLevel,
    sandboxDirectory: message.sandboxDirectory,
    allowNetwork: message.allowNetwork,
    allowedDomains: message.allowedDomains,
    allowedPaths: message.allowedPaths,
  };
}

export const SANDBOX_WORKER_SOURCE = String.raw`
const fs = require("node:fs");
const fsPromises = require("node:fs/promises");
const path = require("node:path");
const { syncBuiltinESMExports } = require("node:module");
const { fileURLToPath } = require("node:url");
const http = require("node:http");
const https = require("node:https");
const net = require("node:net");
const tls = require("node:tls");

const originalFs = {
  readFileSync: fs.readFileSync.bind(fs),
  writeFileSync: fs.writeFileSync.bind(fs),
  appendFileSync: fs.appendFileSync.bind(fs),
  mkdirSync: fs.mkdirSync.bind(fs),
  rmSync: fs.rmSync.bind(fs),
  unlinkSync: fs.unlinkSync.bind(fs),
  readdirSync: fs.readdirSync.bind(fs),
  createReadStream: fs.createReadStream.bind(fs),
  createWriteStream: fs.createWriteStream.bind(fs),
  accessSync: fs.accessSync.bind(fs),
  copyFileSync: fs.copyFileSync.bind(fs),
  renameSync: fs.renameSync.bind(fs),
};

const originalFsPromises = {
  readFile: fsPromises.readFile.bind(fsPromises),
  writeFile: fsPromises.writeFile.bind(fsPromises),
  appendFile: fsPromises.appendFile.bind(fsPromises),
  mkdir: fsPromises.mkdir.bind(fsPromises),
  rm: fsPromises.rm.bind(fsPromises),
  unlink: fsPromises.unlink.bind(fsPromises),
  readdir: fsPromises.readdir.bind(fsPromises),
  access: fsPromises.access.bind(fsPromises),
  copyFile: fsPromises.copyFile.bind(fsPromises),
  rename: fsPromises.rename.bind(fsPromises),
  open: fsPromises.open.bind(fsPromises),
};

const originalHttp = {
  request: http.request.bind(http),
  get: http.get.bind(http),
};

const originalHttps = {
  request: https.request.bind(https),
  get: https.get.bind(https),
};

const originalNet = {
  connect: net.connect.bind(net),
  createConnection: net.createConnection.bind(net),
};

const originalTls = {
  connect: tls.connect.bind(tls),
};

const __vite_ssr_dynamic_import__ = (specifier) => import(specifier);
globalThis.__vite_ssr_dynamic_import__ = __vite_ssr_dynamic_import__;

const hasIpc = typeof process.send === "function";
const protocolWrite = process.stdout.write.bind(process.stdout);
const originalProcessExit = process.exit.bind(process);
if (!hasIpc) {
  process.stdout.write = (...args) => process.stderr.write(...args);
}

const send = (message) => {
  if (hasIpc) {
    process.send(message);
    return;
  }

  protocolWrite(JSON.stringify(message) + "\n");
};

const fail = (error) => {
  send({
    type: "error",
    error: error instanceof Error ? error.message : String(error),
  });
  setImmediate(() => originalProcessExit(1));
};

const serializeResult = (value) => {
  if (typeof value === "string") {
    return value;
  }

  return JSON.stringify(value ?? null);
};

${FILESYSTEM_POLICY_SOURCE}
${NETWORK_POLICY_SOURCE}

const executeMessage = async (message) => {
  if (!message || message.type !== "execute") {
    return;
  }

  try {
    if (message.sandboxLevel >= 2 && message.sandboxDirectory) {
      applyFilesystemSandbox(message.sandboxDirectory, message.allowedPaths ?? []);
    }
    configureNetwork(Boolean(message.allowNetwork), message.allowedDomains ?? []);
    const handler = globalThis.eval("(" + message.handlerSource + ")");
    const result = await handler(message.args);
    send({ type: "result", result: serializeResult(result) });
    setImmediate(() => originalProcessExit(0));
  } catch (error) {
    fail(error);
  }
};
if (hasIpc) {
  process.on("message", (message) => {
    void executeMessage(message);
  });
  send({ type: "ready" });
} else {
  let input = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => {
    input += chunk;
  });
  process.stdin.on("end", () => {
    try {
      const message = JSON.parse(input);
      void executeMessage(message);
    } catch (error) {
      fail(error);
    }
  });
}
`;
