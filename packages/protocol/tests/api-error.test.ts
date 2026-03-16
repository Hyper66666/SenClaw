import { describe, expect, it } from "vitest";
import {
  formatOperatorErrorMessage,
  parseApiErrorPayload,
} from "../src/index.js";

describe("parseApiErrorPayload", () => {
  it("extracts code, message, and details from an API error payload", () => {
    expect(
      parseApiErrorPayload(
        {
          error: "FORBIDDEN",
          message: "Access denied",
          details: { path: "/api/v1/agents" },
        },
        "Fallback message",
      ),
    ).toEqual({
      code: "FORBIDDEN",
      message: "Access denied",
      details: { path: "/api/v1/agents" },
    });
  });

  it("falls back when the payload is not a structured object", () => {
    expect(parseApiErrorPayload("boom", "Fallback message")).toEqual({
      code: "UNKNOWN_ERROR",
      message: "Fallback message",
      details: undefined,
    });
  });
});

describe("formatOperatorErrorMessage", () => {
  it("translates auth and permission statuses into first-party operator messages", () => {
    expect(formatOperatorErrorMessage(401, "API key revoked")).toBe(
      "Authentication failed: API key revoked",
    );
    expect(formatOperatorErrorMessage(403, "Access denied")).toBe(
      "Not enough permissions: Access denied",
    );
    expect(formatOperatorErrorMessage(404, "Not found")).toBe("Not found");
  });
});
