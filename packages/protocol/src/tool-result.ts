import { z } from "zod/v4";

export const ToolResultSchema = z.object({
  toolCallId: z.string().min(1),
  success: z.boolean(),
  content: z.string().optional(),
  error: z.string().optional(),
  approvalRequired: z.boolean().optional(),
  approvalRequestId: z.string().min(1).optional(),
});

export type ToolResult = z.infer<typeof ToolResultSchema>;
