import { describe, expect, it } from "vitest";
import { ApiResponseError } from "../src/index";
import {
  API_KEY_HASH_PARAM,
  API_KEY_STORAGE_KEY,
  MissingApiKeyError,
  type StorageLike,
  clearStoredApiKey,
  describeConsoleError,
  importApiKeyFromHash,
  loadStoredApiKey,
  saveStoredApiKey,
} from "../src/lib/auth-session";

class MemoryStorage implements StorageLike {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

describe("auth session storage", () => {
  it("stores, reads, and clears the configured API key", () => {
    const storage = new MemoryStorage();

    expect(loadStoredApiKey(storage)).toBeUndefined();

    saveStoredApiKey("  sk_test_token  ", storage);
    expect(loadStoredApiKey(storage)).toBe("sk_test_token");
    expect(storage.getItem(API_KEY_STORAGE_KEY)).toBe("sk_test_token");

    clearStoredApiKey(storage);
    expect(loadStoredApiKey(storage)).toBeUndefined();
  });

  it("imports an API key from the URL hash", () => {
    const storage = new MemoryStorage();

    expect(
      importApiKeyFromHash(`#${API_KEY_HASH_PARAM}=sk_hash_token`, storage),
    ).toBe("sk_hash_token");
    expect(loadStoredApiKey(storage)).toBe("sk_hash_token");
  });

  it("ignores unrelated URL hash values", () => {
    const storage = new MemoryStorage();

    expect(importApiKeyFromHash("#tab=agents", storage)).toBeUndefined();
    expect(loadStoredApiKey(storage)).toBeUndefined();
  });
});

describe("describeConsoleError", () => {
  it("returns a recoverable prompt for missing API keys", () => {
    expect(describeConsoleError(new MissingApiKeyError())).toMatchObject({
      title: "API key required",
      message: expect.stringContaining("Configure a gateway API key"),
    });
  });

  it("returns a Chinese prompt for missing API keys", () => {
    expect(
      describeConsoleError(new MissingApiKeyError(), "zh-CN"),
    ).toMatchObject({
      title: "\u9700\u8981 API \u5bc6\u94a5",
      message: expect.stringContaining("Gateway API \u5bc6\u94a5"),
    });
  });

  it("returns an actionable 401 message", () => {
    expect(
      describeConsoleError(
        new ApiResponseError(401, "UNAUTHORIZED", "expired or invalid"),
      ),
    ).toEqual({
      title: "Authentication failed",
      message:
        "The configured API key was rejected by the gateway. Update the key and retry the request.",
    });
  });

  it("returns an actionable 403 message", () => {
    expect(
      describeConsoleError(
        new ApiResponseError(403, "FORBIDDEN", "not enough privileges"),
      ),
    ).toEqual({
      title: "Not enough permissions",
      message:
        "The configured API key does not have permission for this action. Use a key with the required role and retry.",
    });
  });

  it("returns a Chinese 403 message", () => {
    expect(
      describeConsoleError(
        new ApiResponseError(403, "FORBIDDEN", "not enough privileges"),
        "zh-CN",
      ),
    ).toEqual({
      title: "\u6743\u9650\u4e0d\u8db3",
      message:
        "\u5f53\u524d API \u5bc6\u94a5\u6ca1\u6709\u6267\u884c\u8be5\u64cd\u4f5c\u7684\u6743\u9650\uff0c\u8bf7\u6362\u7528\u66f4\u9ad8\u6743\u9650\u7684\u5bc6\u94a5\u3002",
    });
  });
});
