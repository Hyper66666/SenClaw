import { mkdirSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import Database from "better-sqlite3";
import {
  drizzle,
  type BetterSQLite3Database,
} from "drizzle-orm/better-sqlite3";
import { schema } from "./schema.js";

interface SqliteClientLike {
  close(): void;
  pragma(source: string, options?: { simple?: boolean }): unknown;
  prepare<Result = unknown>(source: string): { get(): Result | undefined };
}

export type StorageDatabase = BetterSQLite3Database<typeof schema> & {
  $client: SqliteClientLike;
};

function resolveFilePath(url: string): string {
  if (url === ":memory:") {
    return url;
  }

  if (!url.startsWith("file:")) {
    throw new Error(`Unsupported SQLite URL: ${url}`);
  }

  const rawPath = decodeURIComponent(url.slice("file:".length));
  if (!rawPath) {
    throw new Error("SQLite file URL must include a path");
  }

  const filePath = isAbsolute(rawPath)
    ? rawPath
    : resolve(process.cwd(), rawPath);
  mkdirSync(dirname(filePath), { recursive: true });
  return filePath;
}

export function openDatabase(url: string): StorageDatabase {
  const filePath = resolveFilePath(url);
  const client = new Database(filePath);

  if (filePath !== ":memory:") {
    client.pragma("journal_mode = WAL");
  }

  return drizzle(client, { schema });
}
