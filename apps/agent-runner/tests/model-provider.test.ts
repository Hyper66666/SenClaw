import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const openaiChatFactory = vi.fn((modelId: string) => ({
  modelId,
  apiStyle: "chat",
}));
const openaiDefaultFactory = vi.fn((modelId: string) => ({
  modelId,
  apiStyle: "default",
}));
const createOpenAIMock = vi.fn(() =>
  Object.assign(openaiDefaultFactory, {
    chat: openaiChatFactory,
  }),
);

vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: createOpenAIMock,
}));

describe("resolveModel", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    createOpenAIMock.mockClear();
    openaiChatFactory.mockClear();
    openaiDefaultFactory.mockClear();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("passes compatible OpenAI settings from environment variables", async () => {
    process.env.SENCLAW_OPENAI_API_KEY = "test-key";
    process.env.SENCLAW_OPENAI_BASE_URL = "https://example.com/v1";

    const { resolveModel } = await import("../src/model-provider.js");
    const model = resolveModel({
      provider: "openai",
      model: "doubao-seed-2.0-pro",
    });

    expect(createOpenAIMock).toHaveBeenCalledWith({
      apiKey: "test-key",
      baseURL: "https://example.com/v1",
    });
    expect(openaiChatFactory).toHaveBeenCalledWith("doubao-seed-2.0-pro");
    expect(openaiDefaultFactory).not.toHaveBeenCalled();
    expect(model).toEqual({ modelId: "doubao-seed-2.0-pro", apiStyle: "chat" });
  });

  it("preserves the default OpenAI provider behavior when no overrides are set", async () => {
    const { resolveModel } = await import("../src/model-provider.js");
    resolveModel({
      provider: "openai",
      model: "gpt-4o",
    });

    expect(createOpenAIMock).toHaveBeenCalledWith({
      apiKey: undefined,
      baseURL: undefined,
    });
    expect(openaiChatFactory).toHaveBeenCalledWith("gpt-4o");
    expect(openaiDefaultFactory).not.toHaveBeenCalled();
  });
});
