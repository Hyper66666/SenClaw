import { describe, expect, it } from "vitest";
import { DEFAULT_GLOBAL_PERMISSIONS } from "../src/index.js";
import { evaluateLocalPermission } from "../src/permissions.js";

describe("evaluateLocalPermission", () => {
  it("allows read access to arbitrary local paths by default", () => {
    expect(
      evaluateLocalPermission({
        permissions: DEFAULT_GLOBAL_PERMISSIONS,
        action: "read",
        targetPath: "C:\\Windows\\System32\\drivers\\etc\\hosts",
      }),
    ).toMatchObject({ outcome: "allow" });
  });

  it("denies writes outside whitelisted paths", () => {
    expect(
      evaluateLocalPermission({
        permissions: {
          ...DEFAULT_GLOBAL_PERMISSIONS,
          filesystem: {
            ...DEFAULT_GLOBAL_PERMISSIONS.filesystem,
            writeAllowedPaths: ["D:\\work"],
          },
        },
        action: "write",
        targetPath: "D:\\other\\notes.txt",
      }),
    ).toMatchObject({ outcome: "deny" });
  });

  it("allows writes inside whitelisted paths", () => {
    expect(
      evaluateLocalPermission({
        permissions: {
          ...DEFAULT_GLOBAL_PERMISSIONS,
          filesystem: {
            ...DEFAULT_GLOBAL_PERMISSIONS.filesystem,
            writeAllowedPaths: ["D:\\work"],
          },
        },
        action: "write",
        targetPath: "D:\\work\\notes.txt",
      }),
    ).toMatchObject({ outcome: "allow" });
  });

  it("allows writes anywhere when allowAllWrites is enabled", () => {
    expect(
      evaluateLocalPermission({
        permissions: {
          ...DEFAULT_GLOBAL_PERMISSIONS,
          filesystem: {
            ...DEFAULT_GLOBAL_PERMISSIONS.filesystem,
            allowAllWrites: true,
          },
        },
        action: "write",
        targetPath: "C:\\temp\\notes.txt",
      }),
    ).toMatchObject({ outcome: "allow" });
  });

  it("does not treat prefix-matching sibling paths as whitelisted", () => {
    expect(
      evaluateLocalPermission({
        permissions: {
          ...DEFAULT_GLOBAL_PERMISSIONS,
          filesystem: {
            ...DEFAULT_GLOBAL_PERMISSIONS.filesystem,
            writeAllowedPaths: ["D:\\work"],
          },
        },
        action: "write",
        targetPath: "D:\\work-evil\\notes.txt",
      }),
    ).toMatchObject({ outcome: "deny" });
  });
});
