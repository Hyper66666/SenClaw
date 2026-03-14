import { spawn } from "node:child_process";
import { basename } from "node:path";
import {
  DEFAULT_GLOBAL_PERMISSIONS,
  evaluateLocalPermission,
  type GlobalPermissionsConfig,
} from "@senclaw/config";

export interface ManagedShellExecution {
  command: string;
  args?: string[];
  cwd?: string;
  declaredWritePaths?: string[];
  requiresElevation?: boolean;
  requestedBy?: string;
}

export interface ManagedShellApprovalRequest {
  kind: "shell";
  action: string;
  targetPaths: string[];
  reason: string;
  requestedBy: string;
}

export interface ManagedShellApprovalResult {
  type: "approval_required";
  approvalRequestId: string;
  message: string;
}

export interface ManagedShellOptions {
  permissions?: GlobalPermissionsConfig;
  requestApproval?: (
    request: ManagedShellApprovalRequest,
  ) => Promise<string> | string;
}

const BLOCKED_SHELL_EXECUTABLES = new Set([
  "cmd",
  "cmd.exe",
  "powershell",
  "powershell.exe",
  "pwsh",
  "pwsh.exe",
  "bash",
  "sh",
  "zsh",
  "fish",
]);

const BLOCKED_INLINE_EVAL_FLAGS = new Map<string, string[]>([
  ["node", ["-e", "--eval"]],
  ["node.exe", ["-e", "--eval"]],
  ["python", ["-c"]],
  ["python.exe", ["-c"]],
  ["python3", ["-c"]],
  ["python3.exe", ["-c"]],
  ["ruby", ["-e"]],
  ["ruby.exe", ["-e"]],
  ["perl", ["-e"]],
  ["perl.exe", ["-e"]],
]);

function createApprovalResult(
  approvalRequestId: string,
  message: string,
): ManagedShellApprovalResult {
  return {
    type: "approval_required",
    approvalRequestId,
    message,
  };
}

function isAccessDeniedError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const code = (error as NodeJS.ErrnoException).code;
  return code === "EPERM" || code === "EACCES";
}

function normalizeExecutable(command: string): string {
  return basename(command).toLowerCase();
}

function validateManagedCommandShape(
  command: string,
  args: string[],
): string | undefined {
  const executable = normalizeExecutable(command);
  if (BLOCKED_SHELL_EXECUTABLES.has(executable)) {
    return "Unsupported managed shell command: direct shell interpreters are not allowed.";
  }

  const blockedFlags = BLOCKED_INLINE_EVAL_FLAGS.get(executable);
  if (blockedFlags && args.some((arg) => blockedFlags.includes(arg))) {
    return "Unsupported managed shell command: inline eval flags are not allowed.";
  }

  return undefined;
}

function createApprovalTargets(input: ManagedShellExecution): string[] {
  const declaredTargets = (input.declaredWritePaths ?? []).filter(
    (entry) => entry.trim().length > 0,
  );
  if (declaredTargets.length > 0) {
    return declaredTargets;
  }

  if (input.cwd && input.cwd.trim().length > 0) {
    return [input.cwd];
  }

  return [input.command];
}

async function requestShellApproval(
  input: ManagedShellExecution,
  options: ManagedShellOptions,
  reason: string,
): Promise<ManagedShellApprovalResult> {
  if (!options.requestApproval) {
    throw new Error(reason);
  }

  const approvalRequestId = await options.requestApproval({
    kind: "shell",
    action: "execute",
    targetPaths: createApprovalTargets(input),
    reason,
    requestedBy: input.requestedBy ?? "tool:shell.exec",
  });

  return createApprovalResult(approvalRequestId, reason);
}

function runCommand(input: ManagedShellExecution): Promise<string> {
  return new Promise((resolvePromise, rejectPromise) => {
    let stdout = "";
    let stderr = "";

    const child = spawn(input.command, input.args ?? [], {
      cwd: input.cwd,
      shell: false,
      windowsHide: true,
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
      rejectPromise(error);
    });

    child.on("close", (code, signal) => {
      if (signal) {
        rejectPromise(
          new Error(`Managed shell command was terminated by signal ${signal}`),
        );
        return;
      }

      if (code !== 0) {
        const suffix = stderr.trim().length > 0 ? `: ${stderr.trim()}` : "";
        rejectPromise(
          new Error(`Managed shell command exited with code ${code}${suffix}`),
        );
        return;
      }

      const output = stdout.trim() || stderr.trim();
      resolvePromise(output);
    });
  });
}

export async function executeManagedShell(
  input: ManagedShellExecution,
  options: ManagedShellOptions = {},
): Promise<string | ManagedShellApprovalResult> {
  const permissions = options.permissions ?? DEFAULT_GLOBAL_PERMISSIONS;

  if (!permissions.shell.enabled) {
    throw new Error(
      "Managed shell execution is disabled in the global permissions config.",
    );
  }

  const invalidShapeReason = validateManagedCommandShape(
    input.command,
    input.args ?? [],
  );
  if (invalidShapeReason) {
    throw new Error(invalidShapeReason);
  }

  const decision = evaluateLocalPermission({
    permissions,
    action: "shell",
    declaredWritePaths: input.declaredWritePaths,
    requiresElevation: input.requiresElevation,
  });

  if (decision.outcome === "deny") {
    throw new Error(
      decision.reason ??
        "Managed shell command violates the local permissions policy.",
    );
  }

  if (decision.outcome === "requiresApproval") {
    return requestShellApproval(
      input,
      options,
      decision.reason ??
        "Approval required to execute this managed shell command.",
    );
  }

  try {
    return await runCommand(input);
  } catch (error) {
    if (isAccessDeniedError(error)) {
      return requestShellApproval(
        input,
        options,
        "Approval required to execute this managed shell command.",
      );
    }

    throw error;
  }
}
