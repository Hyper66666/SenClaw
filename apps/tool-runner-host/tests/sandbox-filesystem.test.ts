import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import {
  createFilesystemAccessController,
  isWithinRoot,
  toFilePath,
} from "../src/sandbox-filesystem";

describe("sandbox-filesystem", () => {
  it("normalizes file URLs and nested root relationships", () => {
    const filePath = resolve("sandbox", "nested", "artifact.txt");
    expect(toFilePath(pathToFileURL(filePath))).toBe(filePath);
    expect(isWithinRoot(filePath, resolve("sandbox"))).toBe(true);
    expect(
      isWithinRoot(resolve("elsewhere", "artifact.txt"), resolve("sandbox")),
    ).toBe(false);
  });

  it("allows reads from allowed paths but reserves writes for the sandbox root", () => {
    const sandboxRoot = resolve("sandbox-root");
    const allowedRoot = resolve("allowed-root");
    const controller = createFilesystemAccessController(sandboxRoot, [
      allowedRoot,
    ]);

    expect(controller.ensureReadAccess(join(allowedRoot, "data.txt"))).toBe(
      join(allowedRoot, "data.txt"),
    );
    expect(
      controller.ensureWriteAccess(join(sandboxRoot, "artifact.txt")),
    ).toBe(join(sandboxRoot, "artifact.txt"));
    expect(() =>
      controller.ensureReadAccess(resolve("blocked-root", "data.txt")),
    ).toThrow("Access denied");
    expect(() =>
      controller.ensureWriteAccess(join(allowedRoot, "data.txt")),
    ).toThrow("Access denied");
  });
});
