import { z } from "zod/v4";

export const TaskSchema = z.object({
  agentId: z.string().min(1),
  input: z.string().min(1),
});

export type Task = z.infer<typeof TaskSchema>;
