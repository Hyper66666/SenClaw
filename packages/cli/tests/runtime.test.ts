import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createRuntimeCommandSpec,
  findSenclawWorkspaceRoot,
  resolveSenclawWorkspaceRoot,
} from "../src/lib/runtime.js";

const tempDirs: string[] = [];

function createTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "senclaw-cli-runtime-"));
  tempDirs.push(dir);
  return dir;
}

function scaffoldWorkspace(root: string): void {
  writeFileSync(
    join(root, "pnpm-workspace.yaml"),
    "packages:\n  - packages/*\n",
  );
  mkdirSync(join(root, "scripts"), { recursive: true });
  writeFileSync(join(root, "scripts", "local-runtime.ts"), "export {};\n");
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { force: true, recursive: true });
    }
  }
});

describe("runtime workspace helpers", () => {
  it("finds the workspace root from a nested directory", () => {
    const root = createTempDir();
    scaffoldWorkspace(root);
    const nested = join(root, "packages", "cli", "src");
    mkdirSync(nested, { recursive: true });

    expect(findSenclawWorkspaceRoot(nested)).toBe(resolve(root));
  });

  it("throws a clear error when no workspace is found", () => {
    const dir = createTempDir();

    expect(() => resolveSenclawWorkspaceRoot(undefined, dir)).toThrow(
      "Could not locate a SenClaw workspace.",
    );
  });

  it("builds the runtime launcher command", () => {
    const root = createTempDir();
    const spec = createRuntimeCommandSpec("start", root);

    expect(spec.workspaceRoot).toBe(root);
    expect(spec.command).toBe(process.execPath);
    expect(spec.args).toEqual([
      resolve(root, "scripts", "local-runtime.js"),
      "start",
    ]);
  });
});
