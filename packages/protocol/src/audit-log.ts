import { z } from "zod/v4";

export const AuditLogSchema = z.object({
  id: z.string().min(1),
  keyId: z.string().min(1),
  method: z.string().min(1),
  path: z.string().min(1),
  status: z.number().int().nonnegative(),
  ip: z.string().min(1),
  userAgent: z.string().nullable(),
  requestBody: z.string().nullable(),
  responseTimeMs: z.number().int().nonnegative(),
  timestamp: z.string().datetime(),
});
export type AuditLog = z.infer<typeof AuditLogSchema>;

export const AuditLogListOptionsSchema = z.object({
  limit: z.number().int().positive().max(500).default(100),
  offset: z.number().int().nonnegative().default(0),
});
export type AuditLogListOptions = z.infer<typeof AuditLogListOptionsSchema>;
