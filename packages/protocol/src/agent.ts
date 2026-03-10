import { z } from "zod/v4";
import { ProviderConfigSchema } from "./provider-config.js";

export const AgentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  systemPrompt: z.string().min(1),
  provider: ProviderConfigSchema,
  tools: z.array(z.string()).default([]),
});

export type Agent = z.infer<typeof AgentSchema>;

export const CreateAgentSchema = AgentSchema.omit({ id: true });
export type CreateAgent = z.infer<typeof CreateAgentSchema>;
