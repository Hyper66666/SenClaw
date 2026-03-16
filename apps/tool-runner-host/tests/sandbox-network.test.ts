import { describe, expect, it } from "vitest";
import {
  createNetworkAccessController,
  extractHostname,
  normalizeHostname,
} from "../src/sandbox-network";

describe("sandbox-network", () => {
  it("normalizes and extracts hostnames across input forms", () => {
    expect(normalizeHostname("[EXAMPLE.COM]")).toBe("example.com");
    expect(
      extractHostname(new URL("https://Example.com/path"), undefined),
    ).toBe("example.com");
    expect(extractHostname({ hostname: "LOCALHOST" }, undefined)).toBe(
      "localhost",
    );
    expect(extractHostname("https://api.senclaw.dev/v1", undefined)).toBe(
      "api.senclaw.dev",
    );
  });

  it("rejects disabled or disallowed outbound hosts", () => {
    const disabled = createNetworkAccessController(false, []);
    expect(() => disabled("example.com")).toThrow("Network access is disabled");

    const allowlist = createNetworkAccessController(true, ["example.com"]);
    expect(() => allowlist("example.com")).not.toThrow();
    expect(() => allowlist("blocked.example")).toThrow("Network access denied");
  });
});
