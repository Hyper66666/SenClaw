import { createStorage } from "../dist/index.js";

const url = process.env.SENCLAW_DB_URL;

if (!url) {
  throw new Error("SENCLAW_DB_URL must be set before running db:migrate");
}

createStorage(url);
console.log(`Applied SQLite migrations for ${url}`);
