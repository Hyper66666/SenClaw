import { z } from "zod/v4";

export const ApiKeyRoleSchema = z.enum(["admin", "user", "readonly"]);
export type ApiKeyRole = z.infer<typeof ApiKeyRoleSchema>;

const NullableDatetimeSchema = z.string().datetime().nullable();

export const ApiKeyRecordSchema = z.object({
  id: z.string().min(1),
  lookupHash: z.string().length(64),
  keyHash: z.string().min(1),
  name: z.string().trim().min(1).max(100),
  role: ApiKeyRoleSchema,
  createdBy: z.string().min(1),
  createdAt: z.string().datetime(),
  expiresAt: NullableDatetimeSchema,
  lastUsedAt: NullableDatetimeSchema,
  revokedAt: NullableDatetimeSchema,
  revokedBy: z.string().nullable(),
  revokedReason: z.string().nullable(),
});
export type ApiKeyRecord = z.infer<typeof ApiKeyRecordSchema>;

export const AuthenticatedApiKeySchema = ApiKeyRecordSchema.omit({
  lookupHash: true,
  keyHash: true,
});
export type AuthenticatedApiKey = z.infer<typeof AuthenticatedApiKeySchema>;

export const CreateApiKeyRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    role: ApiKeyRoleSchema,
    expiresAt: z.string().datetime().nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.expiresAt) {
      return;
    }

    if (new Date(value.expiresAt).getTime() <= Date.now()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "expiresAt must be in the future",
        path: ["expiresAt"],
      });
    }
  });
export type CreateApiKeyRequest = z.infer<typeof CreateApiKeyRequestSchema>;

export const RevokeApiKeyRequestSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});
export type RevokeApiKeyRequest = z.infer<typeof RevokeApiKeyRequestSchema>;

export const ApiKeyListFiltersSchema = z.object({
  role: ApiKeyRoleSchema.optional(),
  revoked: z.boolean().optional(),
  expired: z.boolean().optional(),
});
export type ApiKeyListFilters = z.infer<typeof ApiKeyListFiltersSchema>;
