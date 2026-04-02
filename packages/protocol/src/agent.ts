import { z } from "zod/v4";
import { ProviderConfigSchema } from "./provider-config.js";

export const AgentEffortSchema = z.enum(["low", "medium", "high"]);
export type AgentEffort = z.infer<typeof AgentEffortSchema>;

export const AgentIsolationSchema = z.enum(["shared", "isolated"]);
export type AgentIsolation = z.infer<typeof AgentIsolationSchema>;

export const AgentPermissionModeSchema = z.string().min(1).default("default");
export type AgentPermissionMode = z.infer<typeof AgentPermissionModeSchema>;

export const AgentModeSchema = z.enum(["standard", "coordinator"]);
export type AgentMode = z.infer<typeof AgentModeSchema>;

export const AgentDefinitionSchema = z.object({
  name: z.string().min(1),
  systemPrompt: z.string().min(1),
  provider: ProviderConfigSchema,
  tools: z.array(z.string()).default([]),
  effort: AgentEffortSchema.default("medium"),
  isolation: AgentIsolationSchema.default("shared"),
  permissionMode: AgentPermissionModeSchema,
  mode: AgentModeSchema.default("standard"),
  maxTurns: z.number().int().positive().optional(),
  background: z.boolean().default(false),
});
export type AgentDefinition = z.infer<typeof AgentDefinitionSchema>;

export const AgentSchema = AgentDefinitionSchema.extend({
  id: z.string().min(1),
});

export type Agent = z.infer<typeof AgentSchema>;

export const CreateAgentSchema = AgentDefinitionSchema;
export type CreateAgent = z.input<typeof CreateAgentSchema>;
