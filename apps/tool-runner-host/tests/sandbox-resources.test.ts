import { describe, expect, it } from "vitest";
import {
  isOutOfMemory,
  parseLinuxProcessCpuTimeMs,
  shouldMonitorCpu,
} from "../src/sandbox-resources";

describe("sandbox-resources", () => {
  it("detects common out-of-memory stderr patterns", () => {
    expect(
      isOutOfMemory(
        "FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory",
      ),
    ).toBe(true);
    expect(isOutOfMemory("all good")).toBe(false);
  });

  it("parses Linux process CPU ticks into milliseconds", () => {
    const statLine = "12345 (node) S 0 0 0 0 0 0 0 0 0 0 12 13 0 0 0 0";
    expect(parseLinuxProcessCpuTimeMs(statLine, 100)).toBe(250);
  });

  it("only enables CPU monitoring for bounded percentages below 100", () => {
    expect(shouldMonitorCpu(10)).toBe(true);
    expect(shouldMonitorCpu(100)).toBe(false);
    expect(shouldMonitorCpu(0)).toBe(false);
  });
});
