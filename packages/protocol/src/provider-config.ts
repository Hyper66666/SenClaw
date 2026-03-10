import { z } from "zod/v4";

export const ProviderConfigSchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().optional(),
});

export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;
