import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Agent, CreateAgent, IAgentRepository } from "@senclaw/protocol";
import type { StorageDatabase } from "./db.js";
import { observeDbQuery } from "./metrics.js";
import { agentsTable } from "./schema.js";
import {
  deserializeProvider,
  deserializeTools,
  serializeProvider,
  serializeTools,
} from "./serialization.js";

function mapAgent(row: typeof agentsTable.$inferSelect): Agent {
  return {
    id: row.id,
    name: row.name,
    systemPrompt: row.systemPrompt,
    provider: deserializeProvider(row.provider),
    tools: deserializeTools(row.tools),
  };
}

export class SqliteAgentRepository implements IAgentRepository {
  constructor(private readonly db: StorageDatabase) {}

  async create(data: CreateAgent): Promise<Agent> {
    const agent: typeof agentsTable.$inferInsert = {
      id: randomUUID(),
      name: data.name,
      systemPrompt: data.systemPrompt,
      provider: serializeProvider(data.provider),
      tools: serializeTools(data.tools ?? []),
    };

    observeDbQuery("insert", () =>
      this.db.insert(agentsTable).values(agent).run(),
    );
    return mapAgent(agent as typeof agentsTable.$inferSelect);
  }

  async get(id: string): Promise<Agent | undefined> {
    const row = observeDbQuery("select", () =>
      this.db.select().from(agentsTable).where(eq(agentsTable.id, id)).get(),
    );
    return row ? mapAgent(row) : undefined;
  }

  async list(): Promise<Agent[]> {
    return observeDbQuery("select", () =>
      this.db.select().from(agentsTable).all().map(mapAgent),
    );
  }

  async delete(id: string): Promise<boolean> {
    const result = observeDbQuery("delete", () =>
      this.db.delete(agentsTable).where(eq(agentsTable.id, id)).run(),
    );
    return result.changes > 0;
  }
}
