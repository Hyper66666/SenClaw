import type {
  ApiKeyListFilters,
  ApiKeyRecord,
  AuditLog,
  AuditLogListOptions,
  IApiKeyRepository,
  IAuditLogRepository,
} from "@senclaw/protocol";

export class InMemoryApiKeyRepository implements IApiKeyRepository {
  private readonly records = new Map<string, ApiKeyRecord>();
  private readonly lookupHashes = new Map<string, string>();

  async create(data: ApiKeyRecord): Promise<ApiKeyRecord> {
    this.records.set(data.id, data);
    this.lookupHashes.set(data.lookupHash, data.id);
    return data;
  }

  async get(id: string): Promise<ApiKeyRecord | undefined> {
    return this.records.get(id);
  }

  async list(filters?: ApiKeyListFilters): Promise<ApiKeyRecord[]> {
    return Array.from(this.records.values()).filter((record) => {
      if (filters?.role && record.role !== filters.role) {
        return false;
      }

      if (filters?.revoked === true && !record.revokedAt) {
        return false;
      }
      if (filters?.revoked === false && record.revokedAt) {
        return false;
      }

      const now = new Date().toISOString();
      const isExpired = record.expiresAt ? record.expiresAt < now : false;
      if (filters?.expired === true && !isExpired) {
        return false;
      }
      if (filters?.expired === false && isExpired) {
        return false;
      }

      return true;
    });
  }

  async findByLookupHash(
    lookupHash: string,
  ): Promise<ApiKeyRecord | undefined> {
    const id = this.lookupHashes.get(lookupHash);
    return id ? this.records.get(id) : undefined;
  }

  async updateLastUsed(id: string): Promise<void> {
    const record = this.records.get(id);
    if (!record) {
      return;
    }

    this.records.set(id, {
      ...record,
      lastUsedAt: new Date().toISOString(),
    });
  }

  async revoke(
    id: string,
    revokedBy: string,
    revokedReason: string,
  ): Promise<ApiKeyRecord | undefined> {
    const record = this.records.get(id);
    if (!record) {
      return undefined;
    }

    const revoked: ApiKeyRecord = {
      ...record,
      revokedAt: new Date().toISOString(),
      revokedBy,
      revokedReason,
    };
    this.records.set(id, revoked);
    return revoked;
  }

  async count(): Promise<number> {
    return this.records.size;
  }
}

export class InMemoryAuditLogRepository implements IAuditLogRepository {
  private readonly logs: AuditLog[] = [];

  async create(data: AuditLog): Promise<AuditLog> {
    this.logs.push(data);
    return data;
  }

  async listByKeyId(
    keyId: string,
    options: AuditLogListOptions = { limit: 100, offset: 0 },
  ): Promise<AuditLog[]> {
    return this.logs
      .filter((log) => log.keyId === keyId)
      .sort((left, right) => left.timestamp.localeCompare(right.timestamp))
      .slice(options.offset, options.offset + options.limit);
  }

  async countByKeyId(keyId: string): Promise<number> {
    return this.logs.filter((log) => log.keyId === keyId).length;
  }

  async deleteOlderThan(timestamp: string): Promise<number> {
    const before = this.logs.length;
    const remaining = this.logs.filter((log) => log.timestamp >= timestamp);
    this.logs.length = 0;
    this.logs.push(...remaining);
    return before - remaining.length;
  }
}
