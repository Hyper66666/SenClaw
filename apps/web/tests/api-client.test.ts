import { describe, expect, it } from "vitest";
import { createApiClient } from "../src/index";

describe("createApiClient", () => {
  it("adds a bearer token to outgoing requests", async () => {
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    const client = createApiClient({
      baseUrl: "http://localhost:4100",
      apiKey: "sk_test_token",
      fetchImpl: async (input, init) => {
        calls.push({ input, init });
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        });
      },
    });

    const result = await client.request<{ ok: boolean }>("/api/v1/agents");
    expect(result.ok).toBe(true);

    expect(calls).toHaveLength(1);
    expect(String(calls[0].input)).toBe("http://localhost:4100/api/v1/agents");

    const headers = new Headers(calls[0].init?.headers);
    expect(headers.get("authorization")).toBe("Bearer sk_test_token");
    expect(headers.get("accept")).toBe("application/json");
  });
});
