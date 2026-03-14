import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_GLOBAL_PERMISSIONS } from "@senclaw/config";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToolRegistry, registerBuiltinTools } from "../src/index.js";

const fixturePaths: string[] = [];

afterEach(async () => {
  await Promise.all(
    fixturePaths.map((path) => rm(path, { recursive: true, force: true })),
  );
  fixturePaths.length = 0;
});

describe("built-in managed shell tool", () => {
  it("allows managed shell read-only commands", async () => {
    const registry = new ToolRegistry();
    registerBuiltinTools(registry, {
      permissions: DEFAULT_GLOBAL_PERMISSIONS,
    });

    const result = await registry.executeTool("tc-shell-read", "shell.exec", {
      command: process.execPath,
      args: ["--version"],
    });

    expect(result.success).toBe(true);
    expect(result.content).toContain(process.version);
  });

  it("denies managed shell writes outside configured writeAllowedPaths", async () => {
    const registry = new ToolRegistry();
    const allowedDir = await mkdtemp(join(tmpdir(), "senclaw-shell-allow-"));
    const deniedDir = await mkdtemp(join(tmpdir(), "senclaw-shell-deny-"));
    fixturePaths.push(allowedDir, deniedDir);

    registerBuiltinTools(registry, {
      permissions: {
        ...DEFAULT_GLOBAL_PERMISSIONS,
        filesystem: {
          ...DEFAULT_GLOBAL_PERMISSIONS.filesystem,
          writeAllowedPaths: [allowedDir],
        },
      },
    });

    const result = await registry.executeTool("tc-shell-deny", "shell.exec", {
      command: process.execPath,
      args: ["--version"],
      declaredWritePaths: [join(deniedDir, "blocked.txt")],
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("outside allowed paths");
  });

  it("returns an approval-required result for privileged shell actions", async () => {
    const registry = new ToolRegistry();
    const requestApproval = vi.fn(async () => "approval-shell-1");
    registerBuiltinTools(registry, {
      permissions: DEFAULT_GLOBAL_PERMISSIONS,
      requestApproval,
    });

    const result = await registry.executeTool(
      "tc-shell-approval",
      "shell.exec",
      {
        command: process.execPath,
        args: ["--version"],
        requiresElevation: true,
      },
    );

    expect(result).toMatchObject({
      toolCallId: "tc-shell-approval",
      success: false,
      approvalRequired: true,
      approvalRequestId: "approval-shell-1",
    });
    expect(requestApproval).toHaveBeenCalledTimes(1);
  });

  it("rejects unsupported raw shell command shapes", async () => {
    const registry = new ToolRegistry();
    registerBuiltinTools(registry, {
      permissions: DEFAULT_GLOBAL_PERMISSIONS,
    });

    const rawShellInput =
      process.platform === "win32"
        ? { command: "cmd.exe", args: ["/c", "dir"] }
        : { command: "sh", args: ["-lc", "ls"] };

    const result = await registry.executeTool(
      "tc-shell-unsupported",
      "shell.exec",
      rawShellInput,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Unsupported managed shell command");
  });
});
