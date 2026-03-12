import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

export interface RustSandboxRunnerOptions {
  command?: string;
  args?: string[];
  manifestPath?: string;
}

export interface RustSandboxRequest {
  nodePath: string;
  workerSource: string;
  executeMessage: unknown;
  timeoutMs: number;
  maxMemoryMb: number;
  maxCpu: number;
}

interface RustSandboxResponse {
  ok: boolean;
  result?: string;
  error?: string;
}

function resolveToolchainEnv(): Record<string, string> {
  if (process.platform === "win32") {
    return { RUSTUP_TOOLCHAIN: "stable-x86_64-pc-windows-msvc" };
  }

  if (process.platform === "linux") {
    return { RUSTUP_TOOLCHAIN: "stable-x86_64-unknown-linux-gnu" };
  }

  return {};
}

function resolveRunnerInvocation(options: RustSandboxRunnerOptions): {
  command: string;
  args: string[];
} {
  if (options.command) {
    return {
      command: options.command,
      args: options.args ?? [],
    };
  }

  const executableName =
    process.platform === "win32" ? "sandbox-runner.exe" : "sandbox-runner";
  const releasePath = resolve(
    process.cwd(),
    "native",
    "target",
    "release",
    executableName,
  );
  if (existsSync(releasePath)) {
    return { command: releasePath, args: [] };
  }

  const debugPath = resolve(
    process.cwd(),
    "native",
    "target",
    "debug",
    executableName,
  );
  if (existsSync(debugPath)) {
    return { command: debugPath, args: [] };
  }

  return {
    command: "cargo",
    args: [
      "run",
      "--quiet",
      "--manifest-path",
      options.manifestPath ??
        resolve(process.cwd(), "native", "sandbox-runner", "Cargo.toml"),
      "--bin",
      "sandbox-runner",
    ],
  };
}

function createRunnerUnavailableError(
  invocation: { command: string; args: string[] },
  error: unknown,
): Error {
  if (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  ) {
    const missingCommand = invocation.command;
    const guidance =
      missingCommand === "cargo"
        ? "Install Rust and ensure cargo is on PATH, or build native/sandbox-runner before running level 4 tools."
        : "Build native/sandbox-runner before running level 4 tools, or configure rustRunner.command to a valid binary.";

    return new Error(
      `Rust sandbox runner is unavailable: ${missingCommand} was not found. ${guidance}`,
    );
  }

  return error instanceof Error ? error : new Error(String(error));
}
export class RustSandboxRunner {
  constructor(private readonly options: RustSandboxRunnerOptions = {}) {}

  async execute(request: RustSandboxRequest): Promise<string> {
    const invocation = resolveRunnerInvocation(this.options);

    return new Promise<string>((resolvePromise, rejectPromise) => {
      let stdout = "";
      let stderr = "";
      const child = spawn(invocation.command, invocation.args, {
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
        env: {
          ...process.env,
          ...resolveToolchainEnv(),
        },
      });

      child.stdout?.setEncoding("utf8");
      child.stdout?.on("data", (chunk) => {
        stdout += chunk;
      });

      child.stderr?.setEncoding("utf8");
      child.stderr?.on("data", (chunk) => {
        stderr += chunk;
      });

      child.on("error", (error) => {
        rejectPromise(createRunnerUnavailableError(invocation, error));
      });

      child.on("exit", (code) => {
        try {
          const response = JSON.parse(stdout.trim()) as RustSandboxResponse;
          if (response.ok) {
            resolvePromise(response.result ?? "");
            return;
          }

          rejectPromise(
            new Error(
              (response.error ?? stderr.trim()) || "Rust sandbox failed",
            ),
          );
        } catch {
          const message = stderr.trim();
          if (message) {
            rejectPromise(new Error(message));
            return;
          }

          rejectPromise(
            new Error(
              `Rust sandbox runner exited with code ${code ?? "unknown"}`,
            ),
          );
        }
      });

      child.stdin?.end(
        JSON.stringify({
          nodePath: request.nodePath,
          workerSource: request.workerSource,
          executeMessage: request.executeMessage,
          timeoutMs: request.timeoutMs,
          maxMemoryMb: request.maxMemoryMb,
          maxCpu: request.maxCpu,
        }),
      );
    });
  }
}
