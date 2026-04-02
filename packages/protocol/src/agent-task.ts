import { z } from "zod/v4";
import { MessageSchema } from "./message.js";

export const AgentTaskStatusEnum = z.enum([
  "pending",
  "running",
  "paused",
  "completed",
  "failed",
  "killed",
]);
export type AgentTaskStatus = z.infer<typeof AgentTaskStatusEnum>;

export const AgentTaskPendingMessageRoleEnum = z.enum(["user", "system"]);
export type AgentTaskPendingMessageRole = z.infer<
  typeof AgentTaskPendingMessageRoleEnum
>;

export const AgentRunLinkSchema = z.object({
  parentRunId: z.string().min(1).optional(),
  agentTaskId: z.string().min(1).optional(),
});
export type AgentRunLink = z.infer<typeof AgentRunLinkSchema>;

export const AgentTaskMetadataSchema = z.record(z.string(), z.unknown());
export type AgentTaskMetadata = z.infer<typeof AgentTaskMetadataSchema>;

export const AgentTranscriptReferenceSchema = z.object({
  taskId: z.string().min(1),
  lastMessageSeq: z.number().int().nonnegative().default(0),
});
export type AgentTranscriptReference = z.infer<
  typeof AgentTranscriptReferenceSchema
>;

export const CreateAgentTaskSchema = z.object({
  selectedAgentId: z.string().min(1),
  initialInput: z.string().min(1),
  background: z.boolean().default(true),
  parentRunId: z.string().min(1).optional(),
  parentTaskId: z.string().min(1).optional(),
  metadata: AgentTaskMetadataSchema.default({}),
});
export type CreateAgentTask = z.infer<typeof CreateAgentTaskSchema>;

export const AgentTaskSchema = CreateAgentTaskSchema.extend({
  id: z.string().min(1),
  status: AgentTaskStatusEnum,
  activeRunId: z.string().min(1).optional(),
  transcript: AgentTranscriptReferenceSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  error: z.string().optional(),
});
export type AgentTask = z.infer<typeof AgentTaskSchema>;

export const AgentTranscriptEntrySchema = z.object({
  seq: z.number().int().positive(),
  taskId: z.string().min(1),
  sourceRunId: z.string().min(1).optional(),
  message: MessageSchema,
  insertedAt: z.string().datetime(),
});
export type AgentTranscriptEntry = z.infer<typeof AgentTranscriptEntrySchema>;

export const CreateAgentTaskPendingMessageSchema = z.object({
  taskId: z.string().min(1),
  role: AgentTaskPendingMessageRoleEnum,
  content: z.string().min(1),
});
export type CreateAgentTaskPendingMessage = z.infer<
  typeof CreateAgentTaskPendingMessageSchema
>;

export const AgentTaskPendingMessageSchema =
  CreateAgentTaskPendingMessageSchema.extend({
    id: z.string().min(1),
    createdAt: z.string().datetime(),
    deliveredAt: z.string().datetime().optional(),
  });
export type AgentTaskPendingMessage = z.infer<
  typeof AgentTaskPendingMessageSchema
>;
