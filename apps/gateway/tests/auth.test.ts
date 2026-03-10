import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { createServer } from "../src/server.js";

async function createManagedKey(
  app: FastifyInstance,
  adminKey: string,
  payload: {
    name: string;
    role: "admin" | "user" | "readonly";
    expiresAt?: string | null;
  },
) {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/keys",
    headers: {
      authorization: `Bearer ${adminKey}`,
    },
    payload,
  });

  expect(response.statusCode).toBe(201);
  return response.json() as {
    id: string;
    key: string;
    role: "admin" | "user" | "readonly";
  };
}

describe("Gateway authentication", () => {
  let app: FastifyInstance;
  let adminKey: string;
  let apiKeyService: Awaited<ReturnType<typeof createServer>>["apiKeyService"];

  beforeAll(async () => {
    const server = await createServer();
    app = server.app;
    adminKey = server.bootstrapAdminKey ?? "";
    apiKeyService = server.apiKeyService;
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("allows health checks without an API key", async () => {
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
  });

  it("rejects protected routes without an API key", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/agents" });
    expect(response.statusCode).toBe(401);
    expect(response.json().error).toBe("UNAUTHORIZED");
  });

  it("rejects invalid API keys", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/agents",
      headers: {
        authorization: "Bearer sk_invalid",
      },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error).toBe("UNAUTHORIZED");
  });

  it("accepts the bootstrap admin API key on protected routes", async () => {
    expect(adminKey).toBeTruthy();

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/agents",
      headers: {
        authorization: `Bearer ${adminKey}`,
      },
    });

    expect(response.statusCode).toBe(200);
  });

  it("rejects expired API keys", async () => {
    const created = await apiKeyService.createApiKey({
      name: "Expired test key",
      role: "user",
      createdBy: "system",
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/agents",
      headers: {
        authorization: `Bearer ${created.rawKey}`,
      },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().message).toContain("expired");
  });

  it("revokes managed keys and blocks future use", async () => {
    const userKey = await createManagedKey(app, adminKey, {
      name: "Revoked key",
      role: "user",
    });

    const allowedResponse = await app.inject({
      method: "GET",
      url: "/api/v1/agents",
      headers: {
        authorization: `Bearer ${userKey.key}`,
      },
    });
    expect(allowedResponse.statusCode).toBe(200);

    const revokeResponse = await app.inject({
      method: "DELETE",
      url: `/api/v1/keys/${userKey.id}`,
      headers: {
        authorization: `Bearer ${adminKey}`,
      },
      payload: {
        reason: "test revocation",
      },
    });
    expect(revokeResponse.statusCode).toBe(200);

    const blockedResponse = await app.inject({
      method: "GET",
      url: "/api/v1/agents",
      headers: {
        authorization: `Bearer ${userKey.key}`,
      },
    });
    expect(blockedResponse.statusCode).toBe(401);
    expect(blockedResponse.json().message).toContain("revoked");
  });

  it("enforces role-based access for readonly and user keys", async () => {
    const readonlyKey = await createManagedKey(app, adminKey, {
      name: "Readonly key",
      role: "readonly",
    });
    const userKey = await createManagedKey(app, adminKey, {
      name: "User key",
      role: "user",
    });

    const readonlyGet = await app.inject({
      method: "GET",
      url: "/api/v1/agents",
      headers: {
        authorization: `Bearer ${readonlyKey.key}`,
      },
    });
    expect(readonlyGet.statusCode).toBe(200);

    const readonlyPost = await app.inject({
      method: "POST",
      url: "/api/v1/agents",
      headers: {
        authorization: `Bearer ${readonlyKey.key}`,
      },
      payload: {
        name: "Should fail",
        systemPrompt: "No write access",
        provider: { provider: "openai", model: "gpt-4o" },
        tools: [],
      },
    });
    expect(readonlyPost.statusCode).toBe(403);

    const userPost = await app.inject({
      method: "POST",
      url: "/api/v1/agents",
      headers: {
        authorization: `Bearer ${userKey.key}`,
      },
      payload: {
        name: "Allowed",
        systemPrompt: "User write access",
        provider: { provider: "openai", model: "gpt-4o" },
        tools: [],
      },
    });
    expect(userPost.statusCode).toBe(201);

    const userCreateKey = await app.inject({
      method: "POST",
      url: "/api/v1/keys",
      headers: {
        authorization: `Bearer ${userKey.key}`,
      },
      payload: {
        name: "Should fail",
        role: "user",
      },
    });
    expect(userCreateKey.statusCode).toBe(403);
  });

  it("lists managed keys without exposing plaintext values", async () => {
    await createManagedKey(app, adminKey, {
      name: "Listable key",
      role: "user",
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/keys?role=user&revoked=false",
      headers: {
        authorization: `Bearer ${adminKey}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(Array.isArray(body)).toBe(true);
    expect(
      body.some(
        (entry: Record<string, unknown>) => entry.name === "Listable key",
      ),
    ).toBe(true);
    expect(
      body.every((entry: Record<string, unknown>) => !("key" in entry)),
    ).toBe(true);
  });

  it("returns audit logs for managed keys", async () => {
    const userKey = await createManagedKey(app, adminKey, {
      name: "Audited key",
      role: "user",
    });

    const requestResponse = await app.inject({
      method: "GET",
      url: "/api/v1/agents",
      headers: {
        authorization: `Bearer ${userKey.key}`,
      },
    });
    expect(requestResponse.statusCode).toBe(200);

    const auditResponse = await app.inject({
      method: "GET",
      url: `/api/v1/keys/${userKey.id}/audit`,
      headers: {
        authorization: `Bearer ${adminKey}`,
      },
    });

    expect(auditResponse.statusCode).toBe(200);
    expect(auditResponse.json()).toMatchObject({
      total: expect.any(Number),
      logs: expect.arrayContaining([
        expect.objectContaining({
          keyId: userKey.id,
          method: "GET",
          path: "/api/v1/agents",
          status: 200,
        }),
      ]),
    });
  });
});

describe("Gateway rate limiting", () => {
  const originalEnv = { ...process.env };

  let app: FastifyInstance;
  let adminKey: string;
  let userKey: string;

  beforeAll(async () => {
    process.env.SENCLAW_RATE_LIMIT_ADMIN = "10";
    process.env.SENCLAW_RATE_LIMIT_USER = "2";
    process.env.SENCLAW_RATE_LIMIT_READONLY = "1";

    const server = await createServer();
    app = server.app;
    adminKey = server.bootstrapAdminKey ?? "";
    await app.ready();

    const created = await createManagedKey(app, adminKey, {
      name: "Rate limited user",
      role: "user",
    });
    userKey = created.key;
  });

  afterAll(async () => {
    await app.close();
    process.env = originalEnv;
  });

  it("adds rate limit headers and returns 429 when the limit is exceeded", async () => {
    const firstResponse = await app.inject({
      method: "GET",
      url: "/api/v1/agents",
      headers: {
        authorization: `Bearer ${userKey}`,
      },
    });
    expect(firstResponse.statusCode).toBe(200);
    expect(firstResponse.headers["x-ratelimit-limit"]).toBe("2");

    const secondResponse = await app.inject({
      method: "GET",
      url: "/api/v1/agents",
      headers: {
        authorization: `Bearer ${userKey}`,
      },
    });
    expect(secondResponse.statusCode).toBe(200);

    const thirdResponse = await app.inject({
      method: "GET",
      url: "/api/v1/agents",
      headers: {
        authorization: `Bearer ${userKey}`,
      },
    });
    expect(thirdResponse.statusCode).toBe(429);
    expect(thirdResponse.json().error).toBe("RATE_LIMIT_EXCEEDED");
    expect(thirdResponse.headers["retry-after"]).toBeDefined();
  });
});
