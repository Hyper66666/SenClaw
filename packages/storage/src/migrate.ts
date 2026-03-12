import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import type { StorageDatabase } from "./db.js";

const currentDir = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = resolve(currentDir, "../drizzle");

export function runMigrations(db: StorageDatabase): void {
  migrate(db, { migrationsFolder });
}
