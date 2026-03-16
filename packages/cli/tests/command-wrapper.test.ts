import { describe, expect, it, vi } from "vitest";
import { withCLIErrorHandling } from "../src/lib/command-wrapper";

describe("withCLIErrorHandling", () => {
  it("passes through successful command execution", async () => {
    const handler = vi.fn(async (value: string) => {
      expect(value).toBe("ok");
    });

    const wrapped = withCLIErrorHandling(handler, vi.fn());
    await wrapped("ok");

    expect(handler).toHaveBeenCalledWith("ok");
  });

  it("routes failures to the shared error handler", async () => {
    const error = new Error("boom");
    const onError = vi.fn(() => {
      throw error;
    });
    const wrapped = withCLIErrorHandling(async () => {
      throw error;
    }, onError);

    await expect(wrapped()).rejects.toThrow("boom");
    expect(onError).toHaveBeenCalledWith(error);
  });
});
