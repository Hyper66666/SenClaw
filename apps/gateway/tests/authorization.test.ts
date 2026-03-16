import Fastify from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { requireRoles } from "../src/auth/authorization.js";

const apps: Array<ReturnType<typeof Fastify>> = [];

async function createProtectedApp(role?: "admin" | "user" | "readonly") {
  const app = Fastify({ logger: false });
  apps.push(app);

  app.decorateRequest("apiKey", undefined);

  let handlerCalls = 0;

  app.addHook("preHandler", async (request) => {
    if (role) {
      request.apiKey = {
        id: "key-1",
        role,
        createdBy: "system",
        createdAt: new Date().toISOString(),
        expiresAt: null,
        lastUsedAt: null,
        name: "test-key",
        revokedAt: null,
        revokedBy: null,
        revokedReason: null,
      };
    }
  });

  app.get(
    "/protected",
    { preHandler: requireRoles("admin") },
    async (_request, reply) => {
      handlerCalls += 1;
      return reply.send({ ok: true });
    },
  );

  await app.ready();
  return { app, getHandlerCalls: () => handlerCalls };
}

afterEach(async () => {
  while (apps.length > 0) {
    const app = apps.pop();
    if (app) {
      await app.close();
    }
  }
});

describe("requireRoles", () => {
  it("returns 401 and skips the route handler when no API key is present", async () => {
    const { app, getHandlerCalls } = await createProtectedApp();

    const response = await app.inject({ method: "GET", url: "/protected" });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: "UNAUTHORIZED",
      message: "API key required",
    });
    expect(getHandlerCalls()).toBe(0);
  });

  it("returns 403 and skips the route handler when the role is insufficient", async () => {
    const { app, getHandlerCalls } = await createProtectedApp("readonly");

    const response = await app.inject({ method: "GET", url: "/protected" });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      error: "FORBIDDEN",
      message:
        "Insufficient permissions. Required role: admin. Your role: readonly",
    });
    expect(getHandlerCalls()).toBe(0);
  });

  it("allows the request through when the role is allowed", async () => {
    const { app, getHandlerCalls } = await createProtectedApp("admin");

    const response = await app.inject({ method: "GET", url: "/protected" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
    expect(getHandlerCalls()).toBe(1);
  });
});
