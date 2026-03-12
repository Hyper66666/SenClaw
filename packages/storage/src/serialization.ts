import {
  type ProviderConfig,
  ProviderConfigSchema,
  type ToolCall,
  ToolCallSchema,
} from "@senclaw/protocol";
import { z } from "zod/v4";

const ToolsSchema = z.array(z.string());
const ToolCallsSchema = z.array(ToolCallSchema);

export function serializeProvider(provider: ProviderConfig): string {
  return JSON.stringify(provider);
}

export function deserializeProvider(
  value: string | ProviderConfig,
): ProviderConfig {
  if (typeof value === "string") {
    return ProviderConfigSchema.parse(JSON.parse(value));
  }
  return ProviderConfigSchema.parse(value);
}

export function serializeTools(tools: string[]): string {
  return JSON.stringify(tools);
}

export function deserializeTools(value: string | string[]): string[] {
  if (typeof value === "string") {
    return ToolsSchema.parse(JSON.parse(value));
  }
  return ToolsSchema.parse(value);
}

export function serializeToolCalls(toolCalls?: ToolCall[]): string | null {
  if (!toolCalls || toolCalls.length === 0) return null;
  return JSON.stringify(toolCalls);
}

export function deserializeToolCalls(
  value: string | ToolCall[] | null | undefined,
): ToolCall[] | undefined {
  if (value == null) return undefined;
  if (typeof value === "string") {
    return ToolCallsSchema.parse(JSON.parse(value));
  }
  return ToolCallsSchema.parse(value);
}
