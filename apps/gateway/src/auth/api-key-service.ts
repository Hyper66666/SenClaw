import { randomUUID } from "node:crypto";
import type {
  ApiKeyListFilters,
  ApiKeyRole,
  ApiKeyRecord,
  AuthenticatedApiKey,
  IApiKeyRepository,
} from "@senclaw/protocol";
import {
  computeApiKeyLookupHash,
  generateApiKey,
  hashApiKey,
  isValidApiKeyFormat,
  verifyApiKey,
} from "@senclaw/storage";

interface CreateManagedApiKeyInput {
  name: string;
  role: ApiKeyRole;
  createdBy: string;
  expiresAt?: string | null;
}

interface AuthenticationFailure {
  error: string;
  message: string;
}

function sanitizeApiKey(record: ApiKeyRecord): AuthenticatedApiKey {
  const { keyHash: _keyHash, lookupHash: _lookupHash, ...apiKey } = record;
  return apiKey;
}

export class ApiKeyService {
  constructor(private readonly repository: IApiKeyRepository) {}

  async createApiKey(
    input: CreateManagedApiKeyInput,
  ): Promise<{ apiKey: AuthenticatedApiKey; rawKey: string }> {
    const rawKey = generateApiKey();
    const record: ApiKeyRecord = {
      id: randomUUID(),
      lookupHash: computeApiKeyLookupHash(rawKey),
      keyHash: await hashApiKey(rawKey),
      name: input.name,
      role: input.role,
      createdBy: input.createdBy,
      createdAt: new Date().toISOString(),
      expiresAt: input.expiresAt ?? null,
      lastUsedAt: null,
      revokedAt: null,
      revokedBy: null,
      revokedReason: null,
    };

    const created = await this.repository.create(record);
    return {
      apiKey: sanitizeApiKey(created),
      rawKey,
    };
  }

  async authenticateApiKey(
    rawKey: string,
  ): Promise<{ apiKey: AuthenticatedApiKey } | AuthenticationFailure> {
    if (!isValidApiKeyFormat(rawKey)) {
      return {
        error: "UNAUTHORIZED",
        message: "Invalid API key format",
      };
    }

    const record = await this.repository.findByLookupHash(
      computeApiKeyLookupHash(rawKey),
    );
    if (!record) {
      return {
        error: "UNAUTHORIZED",
        message: "API key not found",
      };
    }

    const valid = await verifyApiKey(rawKey, record.keyHash);
    if (!valid) {
      return {
        error: "UNAUTHORIZED",
        message: "API key not found",
      };
    }

    if (record.revokedAt) {
      return {
        error: "UNAUTHORIZED",
        message: "API key has been revoked",
      };
    }

    if (record.expiresAt && record.expiresAt < new Date().toISOString()) {
      return {
        error: "UNAUTHORIZED",
        message: "API key has expired",
      };
    }

    return {
      apiKey: sanitizeApiKey(record),
    };
  }

  async getApiKey(id: string): Promise<AuthenticatedApiKey | undefined> {
    const record = await this.repository.get(id);
    return record ? sanitizeApiKey(record) : undefined;
  }

  async listApiKeys(
    filters?: ApiKeyListFilters,
  ): Promise<AuthenticatedApiKey[]> {
    const records = await this.repository.list(filters);
    return records.map(sanitizeApiKey);
  }

  async updateLastUsed(id: string): Promise<void> {
    await this.repository.updateLastUsed(id);
  }

  async revokeApiKey(
    id: string,
    revokedBy: string,
    reason: string,
  ): Promise<AuthenticatedApiKey | undefined> {
    const record = await this.repository.revoke(id, revokedBy, reason);
    return record ? sanitizeApiKey(record) : undefined;
  }

  async ensureBootstrapAdminKey(options?: {
    print?: boolean;
  }): Promise<string | undefined> {
    if ((await this.repository.count()) > 0) {
      return undefined;
    }

    const { rawKey } = await this.createApiKey({
      name: "Bootstrap Admin Key",
      role: "admin",
      createdBy: "system",
      expiresAt: null,
    });

    if (options?.print !== false) {
      console.log("=".repeat(60));
      console.log("Bootstrap admin API key (save this securely):");
      console.log(rawKey);
      console.log("This key is only printed once.");
      console.log("=".repeat(60));
    }

    return rawKey;
  }
}
