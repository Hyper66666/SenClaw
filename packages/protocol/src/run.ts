import { z } from "zod/v4";
import { AgentRunLinkSchema } from "./agent-task.js";

export const RunStatusEnum = z.enum([
  "pending",
  "running",
  "completed",
  "failed",
]);
export type RunStatus = z.infer<typeof RunStatusEnum>;

export const RunSchema = AgentRunLinkSchema.extend({
  id: z.string().min(1),
  agentId: z.string().min(1),
  input: z.string().min(1),
  status: RunStatusEnum,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  error: z.string().optional(),
});

export type Run = z.infer<typeof RunSchema>;
