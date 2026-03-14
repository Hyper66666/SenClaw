import path from "node:path";
import type { GlobalPermissionsConfig } from "./index.js";

export type LocalPermissionAction =
  | "read"
  | "write"
  | "delete"
  | "mkdir"
  | "rename"
  | "shell";

export type LocalPermissionOutcome = "allow" | "deny" | "requiresApproval";

export interface EvaluateLocalPermissionInput {
  permissions: GlobalPermissionsConfig;
  action: LocalPermissionAction;
  targetPath?: string;
  declaredWritePaths?: string[];
  requiresElevation?: boolean;
}

export interface LocalPermissionDecision {
  outcome: LocalPermissionOutcome;
  reason?: string;
}

type PathModule = typeof path.posix | typeof path.win32;

function isWindowsStylePath(value: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(value) || value.startsWith("\\\\");
}

function selectPathModule(values: Array<string | undefined>): PathModule {
  return values.some((value) => value && isWindowsStylePath(value))
    ? path.win32
    : path.posix;
}

function normalizePath(targetPath: string, pathModule: PathModule): string {
  const normalized = pathModule.normalize(targetPath);
  return pathModule.isAbsolute(normalized)
    ? normalized
    : pathModule.resolve(normalized);
}

function normalizeForComparison(
  targetPath: string,
  pathModule: PathModule,
): string {
  const normalized = normalizePath(targetPath, pathModule);
  return pathModule === path.win32 ? normalized.toLowerCase() : normalized;
}

function isWithinRoot(
  targetPath: string,
  rootPath: string,
  pathModule: PathModule,
): boolean {
  const target = normalizeForComparison(targetPath, pathModule);
  const root = normalizeForComparison(rootPath, pathModule);
  const relative = pathModule.relative(root, target);

  return (
    relative === "" ||
    (!relative.startsWith("..") && !pathModule.isAbsolute(relative))
  );
}

function isMutatingAction(action: LocalPermissionAction): boolean {
  return action !== "read";
}

export function evaluateLocalPermission(
  input: EvaluateLocalPermissionInput,
): LocalPermissionDecision {
  const pathModule = selectPathModule([
    input.targetPath,
    ...input.permissions.filesystem.writeAllowedPaths,
    ...(input.declaredWritePaths ?? []),
  ]);

  if (input.requiresElevation) {
    return input.permissions.filesystem.promptForElevation ||
      input.permissions.shell.promptForElevation
      ? {
          outcome: "requiresApproval",
          reason: "The requested action requires elevated local permissions.",
        }
      : {
          outcome: "deny",
          reason: "The requested action requires elevated local permissions.",
        };
  }

  if (!isMutatingAction(input.action)) {
    return { outcome: "allow" };
  }

  if (input.action === "shell") {
    const declaredWritePaths = input.declaredWritePaths ?? [];
    if (declaredWritePaths.length === 0) {
      return { outcome: "allow" };
    }

    if (input.permissions.filesystem.allowAllWrites) {
      return { outcome: "allow" };
    }

    const allAllowed = declaredWritePaths.every((entry) =>
      input.permissions.filesystem.writeAllowedPaths.some((root) =>
        isWithinRoot(entry, root, pathModule),
      ),
    );

    return allAllowed
      ? { outcome: "allow" }
      : {
          outcome: "deny",
          reason: "Shell command would write outside allowed paths.",
        };
  }

  if (!input.targetPath) {
    return {
      outcome: "deny",
      reason: "A target path is required for mutating filesystem actions.",
    };
  }

  if (input.permissions.filesystem.allowAllWrites) {
    return { outcome: "allow" };
  }

  const matchesAllowedRoot =
    input.permissions.filesystem.writeAllowedPaths.some((root) =>
      isWithinRoot(input.targetPath as string, root, pathModule),
    );

  return matchesAllowedRoot
    ? { outcome: "allow" }
    : {
        outcome: "deny",
        reason: "Target path is outside the configured write allowlist.",
      };
}
