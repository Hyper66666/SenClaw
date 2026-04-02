import { readdir, readFile, writeFile } from "node:fs/promises";
import {
  DEFAULT_GLOBAL_PERMISSIONS,
  evaluateLocalPermission,
  type GlobalPermissionsConfig,
} from "@senclaw/config";
import { z } from "zod/v4";
import { executeManagedShell } from "./managed-shell.js";
import type { PendingApprovalToolExecution, ToolRegistry } from "./registry.js";

const EchoInputSchema = z.object({
  message: z.string(),
});

const ReadTextInputSchema = z.object({
  path: z.string().min(1),
});

const ReadDirInputSchema = z.object({
  path: z.string().min(1),
});

const WriteTextInputSchema = z.object({
  path: z.string().min(1),
  content: z.string(),
});

const ShellExecInputSchema = z.object({
  command: z.string().min(1),
  args: z.array(z.string()).default([]),
  cwd: z.string().min(1).optional(),
  declaredWritePaths: z.array(z.string()).default([]),
  requiresElevation: z.boolean().default(false),
});

interface FileSystemAdapter {
  readFile(path: string, encoding: BufferEncoding): Promise<string>;
  writeFile(
    path: string,
    content: string,
    encoding: BufferEncoding,
  ): Promise<void>;
  readdir(path: string): Promise<string[]>;
}

export interface ApprovalRequestInput {
  kind: "filesystem" | "shell";
  action: string;
  targetPaths: string[];
  reason: string;
  requestedBy: string;
}

export interface RegisterBuiltinToolsOptions {
  permissions?: GlobalPermissionsConfig;
  requestApproval?: (request: ApprovalRequestInput) => Promise<string> | string;
  fileSystem?: Partial<FileSystemAdapter>;
}

function createApprovalResult(
  approvalRequestId: string,
  message: string,
): PendingApprovalToolExecution {
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

async function requestFilesystemApproval(
  options: RegisterBuiltinToolsOptions,
  action: string,
  targetPath: string,
  reason: string,
  requestedBy: string,
): Promise<PendingApprovalToolExecution> {
  if (!options.requestApproval) {
    throw new Error(reason);
  }

  const approvalRequestId = await options.requestApproval({
    kind: "filesystem",
    action,
    targetPaths: [targetPath],
    reason,
    requestedBy,
  });

  return createApprovalResult(approvalRequestId, reason);
}

export function registerBuiltinTools(
  registry: ToolRegistry,
  options: RegisterBuiltinToolsOptions = {},
): void {
  const permissions = options.permissions ?? DEFAULT_GLOBAL_PERMISSIONS;
  const fileSystem: FileSystemAdapter = {
    readFile: options.fileSystem?.readFile ?? readFile,
    writeFile: options.fileSystem?.writeFile ?? writeFile,
    readdir: options.fileSystem?.readdir ?? readdir,
  };

  registry.register(
    {
      name: "echo",
      description: "Returns the input message as-is. Useful for testing.",
      inputSchema: EchoInputSchema,
      concurrency: { safe: true },
    },
    (args) => args.message,
  );

  registry.register(
    {
      name: "fs.read_text",
      description: "Reads a UTF-8 text file from the local filesystem.",
      inputSchema: ReadTextInputSchema,
      concurrency: { safe: true },
    },
    async (args) => {
      try {
        return await fileSystem.readFile(args.path, "utf8");
      } catch (error) {
        if (isAccessDeniedError(error)) {
          return requestFilesystemApproval(
            options,
            "read",
            args.path,
            "Approval required to access this path.",
            "tool:fs.read_text",
          );
        }

        throw error;
      }
    },
  );

  registry.register(
    {
      name: "fs.read_dir",
      description: "Lists entries in a local directory.",
      inputSchema: ReadDirInputSchema,
      concurrency: { safe: true },
    },
    async (args) => {
      try {
        const entries = await fileSystem.readdir(args.path);
        return JSON.stringify(entries);
      } catch (error) {
        if (isAccessDeniedError(error)) {
          return requestFilesystemApproval(
            options,
            "read",
            args.path,
            "Approval required to access this directory.",
            "tool:fs.read_dir",
          );
        }

        throw error;
      }
    },
  );

  registry.register(
    {
      name: "fs.write_text",
      description: "Writes a UTF-8 text file to the local filesystem.",
      inputSchema: WriteTextInputSchema,
    },
    async (args) => {
      const decision = evaluateLocalPermission({
        permissions,
        action: "write",
        targetPath: args.path,
      });
      if (decision.outcome === "deny") {
        throw new Error(
          decision.reason ??
            "Target path is outside the configured write allowlist.",
        );
      }

      if (decision.outcome === "requiresApproval") {
        return requestFilesystemApproval(
          options,
          "write",
          args.path,
          decision.reason ?? "Approval required to write to this path.",
          "tool:fs.write_text",
        );
      }

      try {
        await fileSystem.writeFile(args.path, args.content, "utf8");
        return `Wrote ${args.path}`;
      } catch (error) {
        if (isAccessDeniedError(error)) {
          return requestFilesystemApproval(
            options,
            "write",
            args.path,
            "Approval required to access this path.",
            "tool:fs.write_text",
          );
        }

        throw error;
      }
    },
  );

  registry.register(
    {
      name: "shell.exec",
      description:
        "Runs a managed local command with read-only defaults and declared write targets.",
      inputSchema: ShellExecInputSchema,
    },
    (args) =>
      executeManagedShell(
        {
          ...args,
          requestedBy: "tool:shell.exec",
        },
        {
          permissions,
          requestApproval: options.requestApproval,
        },
      ),
  );
}
