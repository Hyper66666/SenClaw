import type {
  AuditLog,
  AuditLogListOptions,
  IAuditLogRepository,
} from "@senclaw/protocol";
import { asc, count, eq, lt } from "drizzle-orm";
import type { StorageDatabase } from "./db.js";
import { observeDbQuery } from "./metrics.js";
import { auditLogsTable } from "./schema.js";

function mapAuditLog(row: typeof auditLogsTable.$inferSelect): AuditLog {
  return {
    id: row.id,
    keyId: row.keyId,
    method: row.method,
    path: row.path,
    status: row.status,
    ip: row.ip,
    userAgent: row.userAgent ?? null,
    requestBody: row.requestBody ?? null,
    responseTimeMs: row.responseTimeMs,
    timestamp: row.timestamp,
  };
}

export class SqliteAuditLogRepository implements IAuditLogRepository {
  constructor(private readonly db: StorageDatabase) {}

  async create(data: AuditLog): Promise<AuditLog> {
    observeDbQuery("insert", () =>
      this.db.insert(auditLogsTable).values(data).run(),
    );
    return data;
  }

  async listByKeyId(
    keyId: string,
    options: AuditLogListOptions = { limit: 100, offset: 0 },
  ): Promise<AuditLog[]> {
    return observeDbQuery("select", () =>
      this.db
        .select()
        .from(auditLogsTable)
        .where(eq(auditLogsTable.keyId, keyId))
        .orderBy(asc(auditLogsTable.timestamp))
        .limit(options.limit)
        .offset(options.offset)
        .all()
        .map(mapAuditLog),
    );
  }

  async countByKeyId(keyId: string): Promise<number> {
    const result = observeDbQuery("select", () =>
      this.db
        .select({ value: count() })
        .from(auditLogsTable)
        .where(eq(auditLogsTable.keyId, keyId))
        .get(),
    );
    return result?.value ?? 0;
  }

  async deleteOlderThan(timestamp: string): Promise<number> {
    const result = observeDbQuery("delete", () =>
      this.db
        .delete(auditLogsTable)
        .where(lt(auditLogsTable.timestamp, timestamp))
        .run(),
    );
    return result.changes;
  }
}
