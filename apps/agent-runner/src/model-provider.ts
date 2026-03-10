import type { LanguageModel } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import type { ProviderConfig } from "@senclaw/protocol";

type ProviderFactory = (config: ProviderConfig) => LanguageModel;

const providerFactories = new Map<string, ProviderFactory>();

function resolveOpenAIProviderSettings(): {
  apiKey: string | undefined;
  baseURL: string | undefined;
} {
  const apiKey = process.env.SENCLAW_OPENAI_API_KEY?.trim() || undefined;
  const baseURL = process.env.SENCLAW_OPENAI_BASE_URL?.trim() || undefined;

  return { apiKey, baseURL };
}

providerFactories.set("openai", (config) => {
  const openai = createOpenAI(resolveOpenAIProviderSettings());
  return openai.chat(config.model);
});

export function registerProviderFactory(
  name: string,
  factory: ProviderFactory,
): void {
  providerFactories.set(name, factory);
}

export function resolveModel(config: ProviderConfig): LanguageModel {
  const factory = providerFactories.get(config.provider);
  if (!factory) {
    throw new Error(
      `Unknown LLM provider: "${config.provider}". Registered providers: ${Array.from(providerFactories.keys()).join(", ")}`,
    );
  }
  return factory(config);
}
