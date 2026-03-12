import { and, desc, eq } from "drizzle-orm";
import type {
  ConnectorEvent,
  ConnectorEventStatus,
  CreateConnectorEvent,
  IConnectorEventRepository,
} from "@senclaw/protocol";
import { connectorEventsTable } from "./schema.js";
import type { StorageDatabase } from "./db.js";
import { observeDbQuery } from "./metrics.js";

function mapConnectorEvent(
  row: typeof connectorEventsTable.$inferSelect,
): ConnectorEvent {
  return {
    id: row.id,
    connectorId: row.connectorId,
    payload: row.payload,
    transformedInput: row.transformedInput ?? undefined,
    status: row.status as ConnectorEventStatus,
    runId: row.runId ?? undefined,
    error: row.error ?? undefined,
    receivedAt: row.receivedAt,
    processedAt: row.processedAt ?? undefined,
  };
}

export class SqliteConnectorEventRepository
  implements IConnectorEventRepository
{
  constructor(private readonly db: StorageDatabase) {}

  async create(data: CreateConnectorEvent): Promise<ConnectorEvent> {
    const event: typeof connectorEventsTable.$inferInsert = {
      id: data.id,
      connectorId: data.connectorId,
      payload: data.payload,
      transformedInput: null,
      status: data.status,
      runId: null,
      error: null,
      receivedAt: data.receivedAt,
      processedAt: null,
    };

    observeDbQuery("insert", () =>
      this.db.insert(connectorEventsTable).values(event).run(),
    );

    return mapConnectorEvent(event as typeof connectorEventsTable.$inferSelect);
  }

  async get(id: string): Promise<ConnectorEvent | undefined> {
    const row = observeDbQuery("select", () =>
      this.db
        .select()
        .from(connectorEventsTable)
        .where(eq(connectorEventsTable.id, id))
        .get(),
    );

    return row ? mapConnectorEvent(row) : undefined;
  }

  async listByConnectorId(
    connectorId: string,
    filters?: {
      status?: ConnectorEventStatus;
      limit?: number;
      offset?: number;
    },
  ): Promise<ConnectorEvent[]> {
    const conditions = [eq(connectorEventsTable.connectorId, connectorId)];

    if (filters?.status) {
      conditions.push(eq(connectorEventsTable.status, filters.status));
    }

    const rows = observeDbQuery("select", () => {
      let query = this.db
        .select()
        .from(connectorEventsTable)
        .where(and(...conditions))
        .orderBy(desc(connectorEventsTable.receivedAt));

      if (filters?.limit) {
        query = query.limit(filters.limit) as typeof query;
      }

      if (filters?.offset) {
        query = query.offset(filters.offset) as typeof query;
      }

      return query.all();
    });

    return rows.map(mapConnectorEvent);
  }

  async update(
    id: string,
    data: {
      transformedInput?: string;
      status?: ConnectorEventStatus;
      runId?: string;
      error?: string;
      processedAt?: string;
    },
  ): Promise<void> {
    const updates: Partial<typeof connectorEventsTable.$inferInsert> = {};

    if (data.transformedInput !== undefined) {
      updates.transformedInput = data.transformedInput;
    }

    if (data.status !== undefined) {
      updates.status = data.status;
    }

    if (data.runId !== undefined) {
      updates.runId = data.runId;
    }

    if (data.error !== undefined) {
      updates.error = data.error;
    }

    if (data.processedAt !== undefined) {
      updates.processedAt = data.processedAt;
    }

    observeDbQuery("update", () =>
      this.db
        .update(connectorEventsTable)
        .set(updates)
        .where(eq(connectorEventsTable.id, id))
        .run(),
    );
  }
}
