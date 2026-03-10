import { describe, expect, it } from "vitest";

import { appId, defaultPort, createWebDescriptor } from "../src/index";

describe("web", () => {
  it("exposes the expected descriptor", () => {
    expect(appId).toBe("web");
    expect(defaultPort).toBe(4173);
    expect(createWebDescriptor()).toEqual({
      id: "web",
      runtime: "typescript",
      supportedPlatforms: ["windows", "linux"],
      defaultPort: 4173,
    });
  });
});
