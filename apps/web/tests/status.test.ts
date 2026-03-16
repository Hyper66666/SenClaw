import { describe, expect, it } from "vitest";
import { getHealthStatusVariant, getRunStatusVariant } from "../src/lib/status";

describe("status helpers", () => {
  it("maps run statuses to badge variants", () => {
    expect(getRunStatusVariant("pending")).toBe("default");
    expect(getRunStatusVariant("running")).toBe("warning");
    expect(getRunStatusVariant("completed")).toBe("success");
    expect(getRunStatusVariant("failed")).toBe("danger");
  });

  it("maps health statuses to badge variants", () => {
    expect(getHealthStatusVariant("healthy")).toBe("success");
    expect(getHealthStatusVariant("degraded")).toBe("warning");
    expect(getHealthStatusVariant("unhealthy")).toBe("danger");
    expect(getHealthStatusVariant("unknown")).toBe("default");
  });
});
