import { and, asc, eq, gt, isNotNull, isNull, lt, or } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type {
  ApiKeyListFilters,
  ApiKeyRecord,
  IApiKeyRepository,
} from "@senclaw/protocol";
import type { StorageDatabase } from "./db.js";
import { observeDbQuery } from "./metrics.js";
import { apiKeysTable } from "./schema.js";

function mapApiKey(row: typeof apiKeysTable.$inferSelect): ApiKeyRecord {
  return {
    id: row.id,
    lookupHash: row.lookupHash,
    keyHash: row.keyHash,
    name: row.name,
    role: row.role as ApiKeyRecord["role"],
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt ?? null,
    lastUsedAt: row.lastUsedAt ?? null,
    revokedAt: row.revokedAt ?? null,
    revokedBy: row.revokedBy ?? null,
    revokedReason: row.revokedReason ?? null,
  };
}

export class SqliteApiKeyRepository implements IApiKeyRepository {
  constructor(private readonly db: StorageDatabase) {}

  async create(data: ApiKeyRecord): Promise<ApiKeyRecord> {
    observeDbQuery("insert", () =>
      this.db.insert(apiKeysTable).values(data).run(),
    );
    return data;
  }

  async get(id: string): Promise<ApiKeyRecord | undefined> {
    const row = observeDbQuery("select", () =>
      this.db.select().from(apiKeysTable).where(eq(apiKeysTable.id, id)).get(),
    );
    return row ? mapApiKey(row) : undefined;
  }

  async list(filters?: ApiKeyListFilters): Promise<ApiKeyRecord[]> {
    const conditions: SQL[] = [];

    if (filters?.role) {
      conditions.push(eq(apiKeysTable.role, filters.role));
    }

    if (filters?.revoked === true) {
      conditions.push(isNotNull(apiKeysTable.revokedAt));
    } else if (filters?.revoked === false) {
      conditions.push(isNull(apiKeysTable.revokedAt));
    }

    const now = new Date().toISOString();
    if (filters?.expired === true) {
      const expiredCondition = and(
        isNotNull(apiKeysTable.expiresAt),
        lt(apiKeysTable.expiresAt, now),
      );
      if (expiredCondition) {
        conditions.push(expiredCondition);
      }
    } else if (filters?.expired === false) {
      const activeCondition = or(
        isNull(apiKeysTable.expiresAt),
        gt(apiKeysTable.expiresAt, now),
      );
      if (activeCondition) {
        conditions.push(activeCondition);
      }
    }

    const whereClause =
      conditions.length === 0
        ? undefined
        : conditions.length === 1
          ? conditions[0]
          : and(...conditions);
    const query = whereClause
      ? this.db
          .select()
          .from(apiKeysTable)
          .where(whereClause)
          .orderBy(asc(apiKeysTable.createdAt))
      : this.db
          .select()
          .from(apiKeysTable)
          .orderBy(asc(apiKeysTable.createdAt));

    return observeDbQuery("select", () => query.all().map(mapApiKey));
  }

  async findByLookupHash(
    lookupHash: string,
  ): Promise<ApiKeyRecord | undefined> {
    const row = observeDbQuery("select", () =>
      this.db
        .select()
        .from(apiKeysTable)
        .where(eq(apiKeysTable.lookupHash, lookupHash))
        .get(),
    );
    return row ? mapApiKey(row) : undefined;
  }

  async updateLastUsed(id: string): Promise<void> {
    observeDbQuery("update", () =>
      this.db
        .update(apiKeysTable)
        .set({ lastUsedAt: new Date().toISOString() })
        .where(eq(apiKeysTable.id, id))
        .run(),
    );
  }

  async revoke(
    id: string,
    revokedBy: string,
    revokedReason: string,
  ): Promise<ApiKeyRecord | undefined> {
    observeDbQuery("update", () =>
      this.db
        .update(apiKeysTable)
        .set({
          revokedAt: new Date().toISOString(),
          revokedBy,
          revokedReason,
        })
        .where(eq(apiKeysTable.id, id))
        .run(),
    );

    return this.get(id);
  }

  async count(): Promise<number> {
    return observeDbQuery(
      "select",
      () => this.db.select().from(apiKeysTable).all().length,
    );
  }
}
