import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type {
  Connector,
  ConnectorConfig,
  CreateConnector,
  IConnectorRepository,
  Transformation,
  UpdateConnector,
} from "@senclaw/protocol";
import { connectorsTable } from "./schema.js";
import type { StorageDatabase } from "./db.js";
import { observeDbQuery } from "./metrics.js";

function mapConnector(row: typeof connectorsTable.$inferSelect): Connector {
  return {
    id: row.id,
    name: row.name,
    type: row.type as Connector["type"],
    agentId: row.agentId,
    config: JSON.parse(row.config) as ConnectorConfig,
    transformation: JSON.parse(row.transformation) as Transformation,
    enabled: row.enabled,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    lastEventAt: row.lastEventAt ?? undefined,
  };
}

export class SqliteConnectorRepository implements IConnectorRepository {
  constructor(private readonly db: StorageDatabase) {}

  async create(data: CreateConnector): Promise<Connector> {
    const now = new Date().toISOString();

    const connector: typeof connectorsTable.$inferInsert = {
      id: randomUUID(),
      name: data.name,
      type: data.type,
      agentId: data.agentId,
      config: JSON.stringify(data.config),
      transformation: JSON.stringify(data.transformation),
      enabled: true,
      createdAt: now,
      updatedAt: now,
      lastEventAt: null,
    };

    observeDbQuery("insert", () =>
      this.db.insert(connectorsTable).values(connector).run(),
    );

    return mapConnector(connector as typeof connectorsTable.$inferSelect);
  }

  async get(id: string): Promise<Connector | undefined> {
    const row = observeDbQuery("select", () =>
      this.db
        .select()
        .from(connectorsTable)
        .where(eq(connectorsTable.id, id))
        .get(),
    );

    return row ? mapConnector(row) : undefined;
  }

  async list(filters?: {
    type?: string;
    enabled?: boolean;
    agentId?: string;
  }): Promise<Connector[]> {
    const conditions: ReturnType<typeof eq>[] = [];

    if (filters?.type) {
      conditions.push(eq(connectorsTable.type, filters.type));
    }

    if (filters?.enabled !== undefined) {
      conditions.push(eq(connectorsTable.enabled, filters.enabled));
    }

    if (filters?.agentId) {
      conditions.push(eq(connectorsTable.agentId, filters.agentId));
    }

    const rows = observeDbQuery("select", () => {
      let query = this.db.select().from(connectorsTable);

      if (conditions.length > 0) {
        query = query.where(and(...conditions)) as typeof query;
      }

      return query.all();
    });

    return rows.map(mapConnector);
  }

  async update(
    id: string,
    data: UpdateConnector,
  ): Promise<Connector | undefined> {
    const existing = await this.get(id);
    if (!existing) {
      return undefined;
    }

    const updates: Partial<typeof connectorsTable.$inferInsert> = {
      updatedAt: new Date().toISOString(),
    };

    if (data.name !== undefined) {
      updates.name = data.name;
    }

    if (data.config !== undefined) {
      updates.config = JSON.stringify(data.config);
    }

    if (data.transformation !== undefined) {
      updates.transformation = JSON.stringify(data.transformation);
    }

    if (data.enabled !== undefined) {
      updates.enabled = data.enabled;
    }

    observeDbQuery("update", () =>
      this.db
        .update(connectorsTable)
        .set(updates)
        .where(eq(connectorsTable.id, id))
        .run(),
    );

    return this.get(id);
  }

  async delete(id: string): Promise<boolean> {
    const result = observeDbQuery("delete", () =>
      this.db.delete(connectorsTable).where(eq(connectorsTable.id, id)).run(),
    );

    return result.changes > 0;
  }

  async updateLastEventAt(id: string, timestamp: string): Promise<void> {
    observeDbQuery("update", () =>
      this.db
        .update(connectorsTable)
        .set({
          lastEventAt: timestamp,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(connectorsTable.id, id))
        .run(),
    );
  }
}
