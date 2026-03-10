import { z } from "zod/v4";

export const ToolCallSchema = z.object({
  toolCallId: z.string().min(1),
  toolName: z.string().min(1),
  args: z.record(z.string(), z.unknown()),
});

export type ToolCall = z.infer<typeof ToolCallSchema>;

export const MessageSchema = z.discriminatedUnion("role", [
  z.object({
    role: z.literal("system"),
    content: z.string(),
  }),
  z.object({
    role: z.literal("user"),
    content: z.string(),
  }),
  z.object({
    role: z.literal("assistant"),
    content: z.string().optional(),
    toolCalls: z.array(ToolCallSchema).optional(),
  }),
  z.object({
    role: z.literal("tool"),
    toolCallId: z.string().min(1),
    content: z.string(),
  }),
]);

export type Message = z.infer<typeof MessageSchema>;
