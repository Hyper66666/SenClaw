import { AxiosError } from "axios";
import { describe, expect, it } from "vitest";
import { handleAPIError } from "../src/lib/api.js";

function createAxiosResponseError(status: number, message: string) {
  return new AxiosError(
    message,
    "ERR_BAD_REQUEST",
    { headers: {} },
    {},
    {
      status,
      statusText: message,
      headers: {},
      config: { headers: {} },
      data: { message },
    },
  );
}

describe("handleAPIError", () => {
  it("normalizes 401 responses into an authentication error", () => {
    expect(() =>
      handleAPIError(createAxiosResponseError(401, "API key has been revoked")),
    ).toThrow("Authentication failed");
  });

  it("normalizes 403 responses into a permission error", () => {
    expect(() =>
      handleAPIError(createAxiosResponseError(403, "Access denied")),
    ).toThrow("Not enough permissions");
  });
});
