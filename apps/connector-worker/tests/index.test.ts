import { describe, expect, it } from "vitest";

import {
  appId,
  createConnectorWorkerDescriptor,
  defaultPort,
} from "../src/index";

describe("connector-worker", () => {
  it("exposes the expected descriptor", () => {
    expect(appId).toBe("connector-worker");
    expect(defaultPort).toBe(4300);
    expect(createConnectorWorkerDescriptor()).toEqual({
      id: "connector-worker",
      runtime: "typescript",
      supportedPlatforms: ["windows", "linux"],
      defaultPort: 4300,
    });
  });
});
