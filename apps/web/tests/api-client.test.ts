import { describe, expect, it, vi } from "vitest";
import { MissingApiKeyError, createApiClient } from "../src/index";

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

  it("returns undefined for successful 204 responses", async () => {
    const client = createApiClient({
      baseUrl: "http://localhost:4100",
      apiKey: "sk_test_token",
      fetchImpl: async () => new Response(null, { status: 204 }),
    });

    const result = await client.request<void>("/api/v1/agents/agent-1", {
      method: "DELETE",
    });

    expect(result).toBeUndefined();
  });

  it("reads a bearer token from a dynamic callback for protected requests", async () => {
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    const client = createApiClient({
      baseUrl: "http://localhost:4100",
      getApiKey: () => "sk_dynamic_token",
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

    await client.request<{ ok: boolean }>("/api/v1/runs");

    expect(calls).toHaveLength(1);
    const headers = new Headers(calls[0].init?.headers);
    expect(headers.get("authorization")).toBe("Bearer sk_dynamic_token");
  });

  it("rejects protected requests before fetch when no API key is configured", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        }),
    );
    const client = createApiClient({
      baseUrl: "http://localhost:4100",
      getApiKey: () => undefined,
      fetchImpl,
    });

    await expect(client.request("/api/v1/agents")).rejects.toBeInstanceOf(
      MissingApiKeyError,
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("treats runtime approvals endpoints as protected", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify([]), {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        }),
    );
    const client = createApiClient({
      baseUrl: "http://localhost:4100",
      getApiKey: () => undefined,
      fetchImpl,
    });

    await expect(
      client.request("/api/runtime/approvals"),
    ).rejects.toBeInstanceOf(MissingApiKeyError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
