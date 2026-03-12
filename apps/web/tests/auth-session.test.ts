import { describe, expect, it } from "vitest";
import { ApiResponseError } from "../src/index";
import {
  API_KEY_STORAGE_KEY,
  MissingApiKeyError,
  type StorageLike,
  clearStoredApiKey,
  describeConsoleError,
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
});

describe("describeConsoleError", () => {
  it("returns a recoverable prompt for missing API keys", () => {
    expect(describeConsoleError(new MissingApiKeyError())).toMatchObject({
      title: "API key required",
      message: expect.stringContaining("Configure a gateway API key"),
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
});
