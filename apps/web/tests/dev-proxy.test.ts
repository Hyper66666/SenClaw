import { describe, expect, it } from "vitest";
import { resolveGatewayProxyTarget } from "../src/dev-proxy";

describe("resolveGatewayProxyTarget", () => {
  it("uses the configured gateway port for local runtime web requests", () => {
    expect(
      resolveGatewayProxyTarget({
        SENCLAW_GATEWAY_PORT: "18789",
      }),
    ).toBe("http://localhost:18789");
  });

  it("falls back to the default gateway port", () => {
    expect(resolveGatewayProxyTarget({})).toBe("http://localhost:4100");
  });
});
