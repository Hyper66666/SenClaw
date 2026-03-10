import { spawn } from "node:child_process";
import type { ToolDefinition } from "@senclaw/protocol";

export interface SandboxedToolRunnerOptions {
  defaultTimeoutMs?: number;
  defaultMaxMemoryMb?: number;
  defaultMaxCpu?: number;
}

export interface SandboxedToolHandler {
  definition: ToolDefinition;
  execute: (args: unknown) => Promise<string> | string;
}

interface ResolvedSandboxOptions {
  timeoutMs: number;
  maxMemoryMb: number;
  maxCpu: number;
  allowNetwork: boolean;
  allowedDomains: string[];
}

interface ExecuteMessage {
  type: "execute";
  handlerSource: string;
  args: unknown;
  allowNetwork: boolean;
  allowedDomains: string[];
}

interface ResultMessage {
  type: "result";
  result: string;
}

interface ErrorMessage {
  type: "error";
  error: string;
}

const SANDBOX_WORKER_SOURCE = String.raw`
const send = (message) => {
  if (typeof process.send === "function") {
    process.send(message);
  }
};

const fail = (error) => {
  send({
    type: "error",
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
};

const serializeResult = (value) => {
  if (typeof value === "string") {
    return value;
  }

  return JSON.stringify(value ?? null);
};

const disableNetwork = (allowNetwork) => {
  if (allowNetwork) {
    return;
  }

  if (typeof globalThis.fetch === "function") {
    globalThis.fetch = async () => {
      throw new Error("Network access is disabled for this tool");
    };
  }
};

process.on("uncaughtException", fail);
process.on("unhandledRejection", fail);

process.on("message", async (message) => {
  if (!message || message.type !== "execute") {
    return;
  }

  try {
    disableNetwork(Boolean(message.allowNetwork));
    const handler = globalThis.eval("(" + message.handlerSource + ")");
    const result = await handler(message.args);
    send({ type: "result", result: serializeResult(result) });
    process.exit(0);
  } catch (error) {
    fail(error);
  }
});
`;

function resolveSandboxOptions(
  definition: ToolDefinition,
  defaults: SandboxedToolRunnerOptions,
): ResolvedSandboxOptions {
  return {
    timeoutMs:
      definition.sandbox?.timeout ?? defaults.defaultTimeoutMs ?? 30_000,
    maxMemoryMb:
      definition.sandbox?.maxMemory ?? defaults.defaultMaxMemoryMb ?? 512,
    maxCpu: definition.sandbox?.maxCpu ?? defaults.defaultMaxCpu ?? 100,
    allowNetwork: definition.sandbox?.allowNetwork ?? false,
    allowedDomains: definition.sandbox?.allowedDomains ?? [],
  };
}

function isOutOfMemory(stderr: string): boolean {
  const normalized = stderr.toLowerCase();
  return (
    normalized.includes("heap out of memory") ||
    normalized.includes("allocation failed")
  );
}

export class SandboxedToolRunner {
  constructor(private readonly options: SandboxedToolRunnerOptions = {}) {}

  async execute(handler: SandboxedToolHandler, args: unknown): Promise<string> {
    const sandboxOptions = resolveSandboxOptions(
      handler.definition,
      this.options,
    );

    return new Promise<string>((resolve, reject) => {
      let settled = false;
      let receivedMessage = false;
      let stderr = "";

      const child = spawn(
        process.execPath,
        [
          `--max-old-space-size=${sandboxOptions.maxMemoryMb}`,
          "--input-type=module",
          "--eval",
          SANDBOX_WORKER_SOURCE,
        ],
        {
          env: {
            ...process.env,
            NODE_ENV: "sandbox",
            SENCLAW_SANDBOX_MAX_CPU: String(sandboxOptions.maxCpu),
          },
          stdio: ["ignore", "pipe", "pipe", "ipc"],
          windowsHide: true,
        },
      );

      const resolveOnce = (value: string) => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timeoutId);
        resolve(value);
      };

      const rejectOnce = (error: Error) => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timeoutId);
        reject(error);
      };

      child.stderr?.setEncoding("utf8");
      child.stderr?.on("data", (chunk) => {
        stderr += chunk;
      });

      child.on("message", (message: ResultMessage | ErrorMessage) => {
        receivedMessage = true;
        if (message.type === "result") {
          resolveOnce(message.result);
          return;
        }

        rejectOnce(new Error(message.error));
      });

      child.on("error", (error) => {
        rejectOnce(error);
      });

      child.on("exit", (code, signal) => {
        if (settled || receivedMessage) {
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
          rejectOnce(new Error(`Tool process exited with code ${code}`));
          return;
        }

        rejectOnce(new Error("Tool process exited before returning a result"));
      });

      const timeoutId = setTimeout(() => {
        child.kill("SIGKILL");
        rejectOnce(new Error("Tool execution timed out"));
      }, sandboxOptions.timeoutMs);

      const message: ExecuteMessage = {
        type: "execute",
        handlerSource: handler.execute.toString(),
        args,
        allowNetwork: sandboxOptions.allowNetwork,
        allowedDomains: sandboxOptions.allowedDomains,
      };
      child.send(message);
    });
  }
}
