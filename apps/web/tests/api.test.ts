import { afterEach, describe, expect, it, vi } from "vitest";

describe("web API surface", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("sends health checks through the non-conflicting runtime API path", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe("/api/runtime/health");
      return new Response(
        JSON.stringify({
          status: "healthy",
          checks: {
            gateway: { status: "healthy" },
          },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    });

    vi.stubGlobal("fetch", fetchMock);

    const { healthAPI } = await import("../src/lib/api");
    const result = await healthAPI.check();

    expect(result.status).toBe("healthy");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
