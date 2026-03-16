import { type ChildProcess, spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { ToolDefinition } from "@senclaw/protocol";
import { createCpuLimitMonitor, isOutOfMemory } from "./sandbox-resources.js";
import {
  createExecuteMessage,
  type ExecuteMessage,
  type ReadyMessage,
  type ResultMessage,
  SANDBOX_WORKER_SOURCE,
  type SandboxErrorMessage,
} from "./sandbox-worker-source.js";
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

const SANDBOX_CLEANUP_RETRY_DELAY_MS = 100;
const SANDBOX_CLEANUP_MAX_ATTEMPTS = 10;

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
    const message = createExecuteMessage({
      handlerSource: handler.execute.toString(),
      args,
      sandboxLevel: sandboxOptions.level,
      sandboxDirectory,
      allowNetwork: sandboxOptions.allowNetwork,
      allowedDomains: sandboxOptions.allowedDomains,
      allowedPaths: sandboxOptions.allowedPaths,
      type: "execute",
    });

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
      let errorMessage: SandboxErrorMessage | undefined;
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
        (message: ReadyMessage | ResultMessage | SandboxErrorMessage) => {
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

      queuedMessage = createExecuteMessage({
        type: "execute",
        handlerSource: handler.execute.toString(),
        args,
        sandboxLevel: sandboxOptions.level,
        sandboxDirectory,
        allowNetwork: sandboxOptions.allowNetwork,
        allowedDomains: sandboxOptions.allowedDomains,
        allowedPaths: sandboxOptions.allowedPaths,
      });
      dispatchMessage();
    });
  }
}
