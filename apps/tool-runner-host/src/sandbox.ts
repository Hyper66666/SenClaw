import { type ChildProcess, spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { ToolDefinition } from "@senclaw/protocol";
import {
  RustSandboxRunner,
  type RustSandboxRunnerOptions,
} from "./rust-sandbox.js";

export interface SandboxedToolRunnerOptions {
  defaultTimeoutMs?: number;
  defaultMaxMemoryMb?: number;
  defaultMaxCpu?: number;
  rustRunner?: RustSandboxRunnerOptions;
}

export interface SandboxedToolHandler {
  definition: ToolDefinition;
  execute: (args: unknown) => Promise<unknown> | unknown;
}

interface ResolvedSandboxOptions {
  level: 0 | 1 | 2 | 3 | 4;
  timeoutMs: number;
  maxMemoryMb: number;
  maxCpu: number;
  allowNetwork: boolean;
  allowedDomains: string[];
  allowedPaths: string[];
}

interface ExecuteMessage {
  type: "execute";
  handlerSource: string;
  args: unknown;
  sandboxLevel: number;
  sandboxDirectory?: string;
  allowNetwork: boolean;
  allowedDomains: string[];
  allowedPaths: string[];
}

interface ReadyMessage {
  type: "ready";
}

interface ResultMessage {
  type: "result";
  result: string;
}

interface ErrorMessage {
  type: "error";
  error: string;
}

const CPU_MONITOR_POLL_INTERVAL_MS = 250;
const CPU_MONITOR_MIN_ELAPSED_MS = 500;
const CPU_MONITOR_GRACE_MS = 100;
const SANDBOX_CLEANUP_RETRY_DELAY_MS = 100;
const SANDBOX_CLEANUP_MAX_ATTEMPTS = 10;

let linuxClockTicksPerSecondPromise: Promise<number> | undefined;

const SANDBOX_WORKER_SOURCE = String.raw`
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

const toFilePath = (value) => {
  if (value instanceof URL) {
    if (value.protocol !== "file:") {
      throw new Error("Access denied: " + value.toString());
    }

    return fileURLToPath(value);
  }

  return String(value);
};

const isWithinRoot = (targetPath, rootPath) => {
  const relative = path.relative(rootPath, targetPath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
};

const createFsGuards = (sandboxDirectory, allowedPaths) => {
  const sandboxRoot = path.resolve(sandboxDirectory);
  const readableRoots = [sandboxRoot, ...allowedPaths.map((entry) => path.resolve(entry))];

  const ensureReadAccess = (target) => {
    const requestedPath = toFilePath(target);
    const resolvedPath = path.resolve(requestedPath);
    if (readableRoots.some((rootPath) => isWithinRoot(resolvedPath, rootPath))) {
      return resolvedPath;
    }

    throw new Error("Access denied: " + requestedPath);
  };

  const ensureWriteAccess = (target) => {
    const requestedPath = toFilePath(target);
    const resolvedPath = path.resolve(requestedPath);
    if (isWithinRoot(resolvedPath, sandboxRoot)) {
      return resolvedPath;
    }

    throw new Error("Access denied: " + requestedPath);
  };

  const isWriteFlag = (flags) => {
    if (flags == null) {
      return false;
    }

    if (typeof flags === "number") {
      const writeMask =
        fs.constants.O_WRONLY |
        fs.constants.O_RDWR |
        fs.constants.O_APPEND |
        fs.constants.O_CREAT |
        fs.constants.O_TRUNC;
      return (flags & writeMask) !== 0;
    }

    return /[wa+]/.test(String(flags));
  };

  const ensureAccessMode = (target, mode) => {
    if (typeof mode === "number" && (mode & fs.constants.W_OK) !== 0) {
      return ensureWriteAccess(target);
    }

    return ensureReadAccess(target);
  };

  return {
    ensureReadAccess,
    ensureWriteAccess,
    isWriteFlag,
    ensureAccessMode,
  };
};

const applyFilesystemSandbox = (sandboxDirectory, allowedPaths) => {
  const guards = createFsGuards(sandboxDirectory, allowedPaths);

  fs.readFileSync = (targetPath, ...args) =>
    originalFs.readFileSync(guards.ensureReadAccess(targetPath), ...args);
  fs.writeFileSync = (targetPath, ...args) =>
    originalFs.writeFileSync(guards.ensureWriteAccess(targetPath), ...args);
  fs.appendFileSync = (targetPath, ...args) =>
    originalFs.appendFileSync(guards.ensureWriteAccess(targetPath), ...args);
  fs.mkdirSync = (targetPath, ...args) =>
    originalFs.mkdirSync(guards.ensureWriteAccess(targetPath), ...args);
  fs.rmSync = (targetPath, ...args) =>
    originalFs.rmSync(guards.ensureWriteAccess(targetPath), ...args);
  fs.unlinkSync = (targetPath, ...args) =>
    originalFs.unlinkSync(guards.ensureWriteAccess(targetPath), ...args);
  fs.readdirSync = (targetPath, ...args) =>
    originalFs.readdirSync(guards.ensureReadAccess(targetPath), ...args);
  fs.createReadStream = (targetPath, ...args) =>
    originalFs.createReadStream(guards.ensureReadAccess(targetPath), ...args);
  fs.createWriteStream = (targetPath, ...args) =>
    originalFs.createWriteStream(guards.ensureWriteAccess(targetPath), ...args);
  fs.accessSync = (targetPath, mode) =>
    originalFs.accessSync(guards.ensureAccessMode(targetPath, mode), mode);
  fs.copyFileSync = (sourcePath, destinationPath, ...args) =>
    originalFs.copyFileSync(
      guards.ensureReadAccess(sourcePath),
      guards.ensureWriteAccess(destinationPath),
      ...args,
    );
  fs.renameSync = (sourcePath, destinationPath, ...args) =>
    originalFs.renameSync(
      guards.ensureWriteAccess(sourcePath),
      guards.ensureWriteAccess(destinationPath),
      ...args,
    );

  fsPromises.readFile = (targetPath, ...args) =>
    originalFsPromises.readFile(guards.ensureReadAccess(targetPath), ...args);
  fsPromises.writeFile = (targetPath, ...args) =>
    originalFsPromises.writeFile(guards.ensureWriteAccess(targetPath), ...args);
  fsPromises.appendFile = (targetPath, ...args) =>
    originalFsPromises.appendFile(guards.ensureWriteAccess(targetPath), ...args);
  fsPromises.mkdir = (targetPath, ...args) =>
    originalFsPromises.mkdir(guards.ensureWriteAccess(targetPath), ...args);
  fsPromises.rm = (targetPath, ...args) =>
    originalFsPromises.rm(guards.ensureWriteAccess(targetPath), ...args);
  fsPromises.unlink = (targetPath, ...args) =>
    originalFsPromises.unlink(guards.ensureWriteAccess(targetPath), ...args);
  fsPromises.readdir = (targetPath, ...args) =>
    originalFsPromises.readdir(guards.ensureReadAccess(targetPath), ...args);
  fsPromises.access = (targetPath, mode) =>
    originalFsPromises.access(guards.ensureAccessMode(targetPath, mode), mode);
  fsPromises.copyFile = (sourcePath, destinationPath, ...args) =>
    originalFsPromises.copyFile(
      guards.ensureReadAccess(sourcePath),
      guards.ensureWriteAccess(destinationPath),
      ...args,
    );
  fsPromises.rename = (sourcePath, destinationPath, ...args) =>
    originalFsPromises.rename(
      guards.ensureWriteAccess(sourcePath),
      guards.ensureWriteAccess(destinationPath),
      ...args,
    );
  fsPromises.open = (targetPath, flags, ...args) => {
    const validatedPath = guards.isWriteFlag(flags)
      ? guards.ensureWriteAccess(targetPath)
      : guards.ensureReadAccess(targetPath);
    return originalFsPromises.open(validatedPath, flags, ...args);
  };

  syncBuiltinESMExports();
};

const normalizeHostname = (hostname) => {
  if (typeof hostname !== "string" || hostname.length === 0) {
    return undefined;
  }

  return hostname.replace(/^\[|\]$/g, "").toLowerCase();
};

const parseUrlHostname = (value) => {
  try {
    return normalizeHostname(new URL(value.toString()).hostname);
  } catch {
    return undefined;
  }
};

const extractHostname = (primary, secondary) => {
  if (primary instanceof URL) {
    return normalizeHostname(primary.hostname);
  }

  if (typeof primary === "string") {
    if (primary.includes("://")) {
      return parseUrlHostname(primary);
    }

    return typeof secondary === "string" ? normalizeHostname(secondary) : undefined;
  }

  if (typeof primary === "number") {
    return typeof secondary === "string" ? normalizeHostname(secondary) : undefined;
  }

  if (primary && typeof primary === "object") {
    if (typeof primary.hostname === "string") {
      return normalizeHostname(primary.hostname);
    }

    if (typeof primary.host === "string") {
      const host = primary.host.includes("://")
        ? parseUrlHostname(primary.host)
        : normalizeHostname(primary.host.split(":")[0]);
      if (host) {
        return host;
      }
    }

    if (typeof primary.href === "string") {
      return parseUrlHostname(primary.href);
    }
  }

  return undefined;
};

const createNetworkGuard = (allowNetwork, allowedDomains) => {
  const normalizedAllowedDomains = allowedDomains.map((domain) => domain.toLowerCase());

  return (hostname) => {
    if (!allowNetwork) {
      throw new Error("Network access is disabled for this tool");
    }

    if (normalizedAllowedDomains.length === 0) {
      return;
    }

    const normalizedHostname = normalizeHostname(hostname);
    if (!normalizedHostname || !normalizedAllowedDomains.includes(normalizedHostname)) {
      throw new Error("Network access denied: " + (normalizedHostname ?? "unknown-host"));
    }
  };
};

const patchFetch = (ensureNetworkAccess) => {
  if (typeof globalThis.fetch !== "function") {
    return;
  }

  const originalFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = async (input, init) => {
    const requestUrl =
      typeof input === "string" || input instanceof URL ? input.toString() : input.url;
    const hostname = new URL(requestUrl).hostname;
    ensureNetworkAccess(hostname);
    return originalFetch(input, init);
  };
};

const patchHttpModule = (moduleRef, originals, ensureNetworkAccess) => {
  const guardMethod = (originalMethod) => (input, ...args) => {
    ensureNetworkAccess(extractHostname(input, args[0]));
    return originalMethod(input, ...args);
  };

  moduleRef.request = guardMethod(originals.request);
  moduleRef.get = guardMethod(originals.get);
};

const patchSocketConnectors = (ensureNetworkAccess) => {
  net.connect = (primary, secondary, ...args) => {
    ensureNetworkAccess(extractHostname(primary, secondary));
    return originalNet.connect(primary, secondary, ...args);
  };

  net.createConnection = (primary, secondary, ...args) => {
    ensureNetworkAccess(extractHostname(primary, secondary));
    return originalNet.createConnection(primary, secondary, ...args);
  };

  tls.connect = (primary, secondary, ...args) => {
    ensureNetworkAccess(extractHostname(primary, secondary));
    return originalTls.connect(primary, secondary, ...args);
  };
};

const configureNetwork = (allowNetwork, allowedDomains) => {
  const ensureNetworkAccess = createNetworkGuard(allowNetwork, allowedDomains);
  patchFetch(ensureNetworkAccess);
  patchHttpModule(http, originalHttp, ensureNetworkAccess);
  patchHttpModule(https, originalHttps, ensureNetworkAccess);
  patchSocketConnectors(ensureNetworkAccess);
  syncBuiltinESMExports();
};
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

function resolveSandboxOptions(
  definition: ToolDefinition,
  defaults: SandboxedToolRunnerOptions,
): ResolvedSandboxOptions {
  return {
    level: definition.sandbox?.level ?? 0,
    timeoutMs:
      definition.sandbox?.timeout ?? defaults.defaultTimeoutMs ?? 30_000,
    maxMemoryMb:
      definition.sandbox?.maxMemory ?? defaults.defaultMaxMemoryMb ?? 512,
    maxCpu: definition.sandbox?.maxCpu ?? defaults.defaultMaxCpu ?? 100,
    allowNetwork: definition.sandbox?.allowNetwork ?? false,
    allowedDomains: definition.sandbox?.allowedDomains ?? [],
    allowedPaths: (definition.sandbox?.allowedPaths ?? []).map((entry) =>
      resolve(entry),
    ),
  };
}

function isOutOfMemory(stderr: string): boolean {
  const normalized = stderr.toLowerCase();
  return (
    normalized.includes("heap out of memory") ||
    normalized.includes("allocation failed")
  );
}

async function runProbeCommand(
  command: string,
  args: string[],
): Promise<string | undefined> {
  return new Promise((resolvePromise, rejectPromise) => {
    let stdout = "";
    let stderr = "";

    const probe = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    probe.stdout?.setEncoding("utf8");
    probe.stdout?.on("data", (chunk) => {
      stdout += chunk;
    });

    probe.stderr?.setEncoding("utf8");
    probe.stderr?.on("data", (chunk) => {
      stderr += chunk;
    });

    probe.on("error", (error) => {
      rejectPromise(error);
    });

    probe.on("exit", (code) => {
      if (code === 0) {
        resolvePromise(stdout.trim() === "" ? undefined : stdout.trim());
        return;
      }

      rejectPromise(
        new Error(stderr.trim() || `Probe exited with code ${code}`),
      );
    });
  });
}

async function getLinuxClockTicksPerSecond(): Promise<number> {
  linuxClockTicksPerSecondPromise ??= runProbeCommand("getconf", ["CLK_TCK"])
    .then((output) => {
      const parsed = Number(output);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 100;
    })
    .catch(() => 100);

  return linuxClockTicksPerSecondPromise;
}

function parseLinuxProcessCpuTimeMs(
  statLine: string,
  clockTicksPerSecond: number,
): number | undefined {
  const processNameEnd = statLine.lastIndexOf(")");
  if (processNameEnd === -1) {
    return undefined;
  }

  const fields = statLine
    .slice(processNameEnd + 2)
    .trim()
    .split(/\s+/);
  const userTicks = Number(fields[11]);
  const systemTicks = Number(fields[12]);
  if (!Number.isFinite(userTicks) || !Number.isFinite(systemTicks)) {
    return undefined;
  }

  return ((userTicks + systemTicks) * 1000) / clockTicksPerSecond;
}

async function readLinuxProcessCpuTimeMs(
  pid: number,
): Promise<number | undefined> {
  try {
    const [statLine, clockTicksPerSecond] = await Promise.all([
      readFile(`/proc/${pid}/stat`, "utf8"),
      getLinuxClockTicksPerSecond(),
    ]);

    return parseLinuxProcessCpuTimeMs(statLine, clockTicksPerSecond);
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      return undefined;
    }

    throw error;
  }
}

async function readWindowsProcessCpuTimeMs(
  pid: number,
): Promise<number | undefined> {
  const output = await runProbeCommand("powershell.exe", [
    "-NoProfile",
    "-Command",
    `$process = Get-Process -Id ${pid} -ErrorAction SilentlyContinue; if ($null -ne $process) { Write-Output $process.CPU }`,
  ]);
  if (!output) {
    return undefined;
  }

  const seconds = Number(output.split(/\r?\n/).at(-1));
  return Number.isFinite(seconds) ? seconds * 1000 : undefined;
}

async function readProcessCpuTimeMs(pid: number): Promise<number | undefined> {
  if (process.platform === "linux") {
    return readLinuxProcessCpuTimeMs(pid);
  }

  if (process.platform === "win32") {
    return readWindowsProcessCpuTimeMs(pid);
  }

  return undefined;
}

function shouldMonitorCpu(maxCpu: number): boolean {
  return Number.isFinite(maxCpu) && maxCpu > 0 && maxCpu < 100;
}

function createCpuLimitMonitor(
  child: ChildProcess,
  maxCpu: number,
  onLimitExceeded: (error: Error) => void,
): () => void {
  const childPid = child.pid;
  if (!childPid || !shouldMonitorCpu(maxCpu)) {
    return () => {};
  }

  let checking = false;
  let stopped = false;
  const startedAt = Date.now();

  const intervalId = setInterval(() => {
    if (
      checking ||
      stopped ||
      child.exitCode !== null ||
      child.signalCode !== null
    ) {
      return;
    }

    checking = true;
    void readProcessCpuTimeMs(childPid)
      .then((cpuTimeMs) => {
        if (stopped || cpuTimeMs == null) {
          return;
        }

        const elapsedMs = Date.now() - startedAt;
        if (elapsedMs < CPU_MONITOR_MIN_ELAPSED_MS) {
          return;
        }

        const allowedCpuMs = elapsedMs * (maxCpu / 100) + CPU_MONITOR_GRACE_MS;
        if (cpuTimeMs > allowedCpuMs) {
          child.kill("SIGKILL");
          onLimitExceeded(
            new Error(`Tool execution exceeded CPU limit (${maxCpu}%)`),
          );
        }
      })
      .catch(() => {
        // Best-effort monitoring only. Timeout and crash handling stay active.
      })
      .finally(() => {
        checking = false;
      });
  }, CPU_MONITOR_POLL_INTERVAL_MS);

  intervalId.unref?.();

  return () => {
    stopped = true;
    clearInterval(intervalId);
  };
}

function isRetriableSandboxCleanupError(error: unknown): boolean {
  if (!(error instanceof Error) || !("code" in error)) {
    return false;
  }

  const code = (error as NodeJS.ErrnoException).code;
  return code === "EBUSY" || code === "EPERM" || code === "ENOTEMPTY";
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

async function removeSandboxDirectory(directory: string): Promise<void> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= SANDBOX_CLEANUP_MAX_ATTEMPTS; attempt += 1) {
    try {
      await rm(directory, { recursive: true, force: true });
      return;
    } catch (error) {
      if (!isRetriableSandboxCleanupError(error)) {
        throw error;
      }

      lastError = error as Error;
      if (attempt === SANDBOX_CLEANUP_MAX_ATTEMPTS) {
        break;
      }

      await delay(SANDBOX_CLEANUP_RETRY_DELAY_MS * attempt);
    }
  }

  if (lastError) {
    throw lastError;
  }
}

export class SandboxedToolRunner {
  private readonly rustRunner: RustSandboxRunner;

  constructor(private readonly options: SandboxedToolRunnerOptions = {}) {
    this.rustRunner = new RustSandboxRunner(options.rustRunner);
  }

  private async cleanupSandboxDirectory(
    sandboxDirectory?: string,
  ): Promise<void> {
    if (!sandboxDirectory) {
      return;
    }

    await removeSandboxDirectory(sandboxDirectory);
  }

  private async executeWithRustRunner(
    handler: SandboxedToolHandler,
    args: unknown,
    sandboxOptions: ResolvedSandboxOptions,
    sandboxDirectory?: string,
  ): Promise<unknown> {
    const message: ExecuteMessage = {
      type: "execute",
      handlerSource: handler.execute.toString(),
      args,
      sandboxLevel: sandboxOptions.level,
      sandboxDirectory,
      allowNetwork: sandboxOptions.allowNetwork,
      allowedDomains: sandboxOptions.allowedDomains,
      allowedPaths: sandboxOptions.allowedPaths,
    };

    try {
      return await this.rustRunner.execute({
        nodePath: process.execPath,
        workerSource: SANDBOX_WORKER_SOURCE,
        executeMessage: message,
        timeoutMs: sandboxOptions.timeoutMs,
        maxMemoryMb: sandboxOptions.maxMemoryMb,
        maxCpu: sandboxOptions.maxCpu,
      });
    } finally {
      await this.cleanupSandboxDirectory(sandboxDirectory);
    }
  }

  async execute(
    handler: SandboxedToolHandler,
    args: unknown,
  ): Promise<unknown> {
    const sandboxOptions = resolveSandboxOptions(
      handler.definition,
      this.options,
    );
    const sandboxDirectory =
      sandboxOptions.level >= 2
        ? await mkdtemp(join(tmpdir(), "senclaw-sandbox-"))
        : undefined;

    if (sandboxOptions.level === 4) {
      return this.executeWithRustRunner(
        handler,
        args,
        sandboxOptions,
        sandboxDirectory,
      );
    }

    return new Promise<string>((resolvePromise, rejectPromise) => {
      let settled = false;
      let stderr = "";
      let workerReady = false;
      let queuedMessage: ExecuteMessage | undefined;
      let resultMessage: ResultMessage | undefined;
      let errorMessage: ErrorMessage | undefined;
      let cleanedUp = false;
      let stopCpuMonitor = () => {};
      let pendingError: Error | undefined;
      let timeoutId: NodeJS.Timeout | undefined;
      let startupTimeoutId: NodeJS.Timeout | undefined;

      const cleanup = async () => {
        if (!sandboxDirectory || cleanedUp) {
          return;
        }

        cleanedUp = true;
        await removeSandboxDirectory(sandboxDirectory);
      };

      const settleOnce = (settler: () => void) => {
        if (settled) {
          return;
        }

        settled = true;
        stopCpuMonitor();
        if (startupTimeoutId) {
          clearTimeout(startupTimeoutId);
          startupTimeoutId = undefined;
        }
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = undefined;
        }
        void cleanup().then(
          () => settler(),
          (cleanupError) => rejectPromise(cleanupError),
        );
      };

      const resolveOnce = (value: string) => {
        settleOnce(() => resolvePromise(value));
      };

      const rejectOnce = (error: Error) => {
        settleOnce(() => rejectPromise(error));
      };

      const recordPendingError = (error: Error) => {
        pendingError ??= error;
      };

      const child = spawn(
        process.execPath,
        [
          `--max-old-space-size=${sandboxOptions.maxMemoryMb}`,
          "--eval",
          SANDBOX_WORKER_SOURCE,
        ],
        {
          cwd: sandboxDirectory,
          env: {
            ...process.env,
            NODE_ENV: "sandbox",
            SENCLAW_SANDBOX_MAX_CPU: String(sandboxOptions.maxCpu),
          },
          stdio: ["ignore", "pipe", "pipe", "ipc"],
          windowsHide: true,
        },
      );

      child.stderr?.setEncoding("utf8");
      child.stderr?.on("data", (chunk) => {
        stderr += chunk;
      });

      const dispatchMessage = () => {
        if (!workerReady || !queuedMessage) {
          return;
        }

        const nextMessage = queuedMessage;
        queuedMessage = undefined;
        try {
          child.send(nextMessage);
        } catch (error) {
          rejectOnce(error instanceof Error ? error : new Error(String(error)));
        }
      };

      const startExecutionTimer = () => {
        if (timeoutId) {
          return;
        }

        timeoutId = setTimeout(() => {
          recordPendingError(new Error("Tool execution timed out"));
          child.kill("SIGKILL");
        }, sandboxOptions.timeoutMs);

        stopCpuMonitor = createCpuLimitMonitor(
          child,
          sandboxOptions.maxCpu,
          recordPendingError,
        );
      };

      child.on(
        "message",
        (message: ReadyMessage | ResultMessage | ErrorMessage) => {
          if (message.type === "ready") {
            workerReady = true;
            if (startupTimeoutId) {
              clearTimeout(startupTimeoutId);
              startupTimeoutId = undefined;
            }
            dispatchMessage();
            startExecutionTimer();
            return;
          }

          if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = undefined;
          }
          stopCpuMonitor();

          if (message.type === "result") {
            resultMessage = message;
            return;
          }

          errorMessage = message;
        },
      );

      child.on("error", (error) => {
        rejectOnce(error);
      });

      child.on("close", (code, signal) => {
        if (errorMessage) {
          rejectOnce(new Error(errorMessage.error));
          return;
        }

        if (resultMessage) {
          resolveOnce(resultMessage.result);
          return;
        }

        if (pendingError) {
          rejectOnce(pendingError);
          return;
        }

        if (isOutOfMemory(stderr)) {
          rejectOnce(
            new Error(
              `Tool execution exceeded memory limit (${sandboxOptions.maxMemoryMb} MB)`,
            ),
          );
          return;
        }

        if (signal) {
          rejectOnce(new Error(`Tool process killed by signal ${signal}`));
          return;
        }

        if (code !== 0) {
          const trimmedStderr = stderr.trim();
          rejectOnce(
            new Error(
              trimmedStderr === ""
                ? `Tool process exited with code ${code}`
                : `Tool process exited with code ${code}: ${trimmedStderr}`,
            ),
          );
          return;
        }

        rejectOnce(new Error("Tool process exited before returning a result"));
      });

      startupTimeoutId = setTimeout(
        () => {
          if (workerReady) {
            return;
          }

          recordPendingError(
            new Error("Sandbox worker failed to become ready"),
          );
          child.kill("SIGKILL");
        },
        Math.max(1000, sandboxOptions.timeoutMs),
      );

      queuedMessage = {
        type: "execute",
        handlerSource: handler.execute.toString(),
        args,
        sandboxLevel: sandboxOptions.level,
        sandboxDirectory,
        allowNetwork: sandboxOptions.allowNetwork,
        allowedDomains: sandboxOptions.allowedDomains,
        allowedPaths: sandboxOptions.allowedPaths,
      };
      dispatchMessage();
    });
  }
}
