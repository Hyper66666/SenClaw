import { describe, expect, it } from "vitest";

import { appId, defaultPort, createSchedulerDescriptor } from "../src/index";

describe("scheduler", () => {
  it("exposes the expected descriptor", () => {
    expect(appId).toBe("scheduler");
    expect(defaultPort).toBe(4500);
    expect(createSchedulerDescriptor()).toEqual({
      id: "scheduler",
      runtime: "typescript",
      supportedPlatforms: ["windows", "linux"],
      defaultPort: 4500,
    });
  });
});
