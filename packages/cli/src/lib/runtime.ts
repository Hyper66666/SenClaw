import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

export type RuntimeAction = "start" | "stop";

export interface RuntimeCommandSpec {
  command: string;
  args: string[];
  workspaceRoot: string;
}

export function findSenclawWorkspaceRoot(
  startDir = process.cwd(),
): string | undefined {
  let current = resolve(startDir);

  while (true) {
    if (
      existsSync(resolve(current, "pnpm-workspace.yaml")) &&
      existsSync(resolve(current, "scripts", "local-runtime.ts"))
    ) {
      return current;
    }

    const parent = dirname(current);
    if (parent === current) {
      return undefined;
    }

    current = parent;
  }
}

export function resolveSenclawWorkspaceRoot(
  workspacePath?: string,
  startDir = process.cwd(),
): string {
  const resolved = workspacePath
    ? resolve(workspacePath)
    : findSenclawWorkspaceRoot(startDir);

  if (!resolved) {
    throw new Error(
      "Could not locate a SenClaw workspace. Run this command from the repository root or pass --workspace <path>.",
    );
  }

  return resolved;
}

export function createRuntimeCommandSpec(
  action: RuntimeAction,
  workspaceRoot: string,
): RuntimeCommandSpec {
  return {
    command: process.platform === "win32" ? "corepack.cmd" : "corepack",
    args: ["pnpm", "exec", "tsx", "scripts/local-runtime.ts", action],
    workspaceRoot,
  };
}
