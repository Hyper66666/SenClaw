import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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

describe("built-in filesystem tools", () => {
  it("reads text from arbitrary local paths", async () => {
    const registry = new ToolRegistry();
    registerBuiltinTools(registry, {
      permissions: DEFAULT_GLOBAL_PERMISSIONS,
    });

    const fixtureDir = await mkdtemp(join(tmpdir(), "senclaw-fs-read-"));
    fixturePaths.push(fixtureDir);
    const filePath = join(fixtureDir, "note.txt");
    await writeFile(filePath, "hello from disk", "utf8");

    const result = await registry.executeTool("tc-fs-read", "fs.read_text", {
      path: filePath,
    });

    expect(result).toEqual({
      toolCallId: "tc-fs-read",
      success: true,
      content: "hello from disk",
    });
  });

  it("denies writes outside configured writeAllowedPaths", async () => {
    const registry = new ToolRegistry();
    const allowedDir = await mkdtemp(join(tmpdir(), "senclaw-fs-allow-"));
    const deniedDir = await mkdtemp(join(tmpdir(), "senclaw-fs-deny-"));
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

    const result = await registry.executeTool("tc-fs-deny", "fs.write_text", {
      path: join(deniedDir, "blocked.txt"),
      content: "blocked",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("write allowlist");
  });

  it("allows writes inside configured writeAllowedPaths", async () => {
    const registry = new ToolRegistry();
    const allowedDir = await mkdtemp(join(tmpdir(), "senclaw-fs-write-"));
    fixturePaths.push(allowedDir);
    const targetPath = join(allowedDir, "written.txt");
    registerBuiltinTools(registry, {
      permissions: {
        ...DEFAULT_GLOBAL_PERMISSIONS,
        filesystem: {
          ...DEFAULT_GLOBAL_PERMISSIONS.filesystem,
          writeAllowedPaths: [allowedDir],
        },
      },
    });

    const result = await registry.executeTool("tc-fs-write", "fs.write_text", {
      path: targetPath,
      content: "written",
    });

    expect(result.success).toBe(true);
    expect(await readFile(targetPath, "utf8")).toBe("written");
  });

  it("returns an approval-required result when local filesystem access needs elevation", async () => {
    const registry = new ToolRegistry();
    const requestApproval = vi.fn(async () => "approval-1");
    registerBuiltinTools(registry, {
      permissions: DEFAULT_GLOBAL_PERMISSIONS,
      requestApproval,
      fileSystem: {
        readFile: async () => {
          const error = new Error("Access denied") as NodeJS.ErrnoException;
          error.code = "EPERM";
          throw error;
        },
        writeFile,
      },
    });

    const result = await registry.executeTool(
      "tc-fs-approval",
      "fs.read_text",
      {
        path: "C:\\Windows\\System32\\drivers\\etc\\hosts",
      },
    );

    expect(result).toMatchObject({
      toolCallId: "tc-fs-approval",
      success: false,
      approvalRequired: true,
      approvalRequestId: "approval-1",
    });
    expect(requestApproval).toHaveBeenCalledTimes(1);
  });
});
