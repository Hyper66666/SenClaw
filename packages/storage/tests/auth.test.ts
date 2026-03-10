import { describe, expect, it } from "vitest";
import {
  computeApiKeyLookupHash,
  createStorage,
  generateApiKey,
  hashApiKey,
  isValidApiKeyFormat,
  verifyApiKey,
} from "../src/index.js";

describe("API key helpers", () => {
  it("generates and verifies a valid API key", async () => {
    const apiKey = generateApiKey();
    expect(isValidApiKeyFormat(apiKey)).toBe(true);

    const hash = await hashApiKey(apiKey);
    await expect(verifyApiKey(apiKey, hash)).resolves.toBe(true);
    await expect(verifyApiKey(`${apiKey}x`, hash)).resolves.toBe(false);
  });

  it("derives a stable lookup hash", () => {
    const apiKey = generateApiKey();
    expect(computeApiKeyLookupHash(apiKey)).toBe(
      computeApiKeyLookupHash(apiKey),
    );
  });
});

describe("SqliteApiKeyRepository", () => {
  it("creates, finds, updates, lists, and revokes API keys", async () => {
    const storage = createStorage(":memory:");
    const rawKey = generateApiKey();

    const created = await storage.apiKeys.create({
      id: "key-1",
      lookupHash: computeApiKeyLookupHash(rawKey),
      keyHash: await hashApiKey(rawKey),
      name: "Test Key",
      role: "user",
      createdBy: "system",
      createdAt: new Date().toISOString(),
      expiresAt: null,
      lastUsedAt: null,
      revokedAt: null,
      revokedBy: null,
      revokedReason: null,
    });

    expect(created.id).toBe("key-1");

    const found = await storage.apiKeys.findByLookupHash(
      computeApiKeyLookupHash(rawKey),
    );
    expect(found?.id).toBe("key-1");

    await storage.apiKeys.updateLastUsed("key-1");
    const updated = await storage.apiKeys.get("key-1");
    expect(updated?.lastUsedAt).toBeTruthy();

    const listed = await storage.apiKeys.list({ revoked: false });
    expect(listed).toHaveLength(1);

    const revoked = await storage.apiKeys.revoke(
      "key-1",
      "admin-key",
      "test revoke",
    );
    expect(revoked?.revokedBy).toBe("admin-key");
    expect(revoked?.revokedReason).toBe("test revoke");
  });
});

describe("SqliteAuditLogRepository", () => {
  it("creates, lists, counts, and deletes audit logs", async () => {
    const storage = createStorage(":memory:");
    const rawKey = generateApiKey();

    await storage.apiKeys.create({
      id: "key-1",
      lookupHash: computeApiKeyLookupHash(rawKey),
      keyHash: await hashApiKey(rawKey),
      name: "Audit Key",
      role: "admin",
      createdBy: "system",
      createdAt: new Date().toISOString(),
      expiresAt: null,
      lastUsedAt: null,
      revokedAt: null,
      revokedBy: null,
      revokedReason: null,
    });

    await storage.auditLogs.create({
      id: "log-1",
      keyId: "key-1",
      method: "GET",
      path: "/api/v1/agents",
      status: 200,
      ip: "127.0.0.1",
      userAgent: "vitest",
      requestBody: null,
      responseTimeMs: 12,
      timestamp: "2026-03-10T00:00:00.000Z",
    });

    const logs = await storage.auditLogs.listByKeyId("key-1", {
      limit: 10,
      offset: 0,
    });
    expect(logs).toHaveLength(1);
    expect(await storage.auditLogs.countByKeyId("key-1")).toBe(1);

    const deleted = await storage.auditLogs.deleteOlderThan(
      "2026-03-11T00:00:00.000Z",
    );
    expect(deleted).toBe(1);
  });
});
