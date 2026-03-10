import assert from "node:assert/strict";
import { existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { createServer } from "../apps/gateway/dist/index.js";

function resolveDbPath(dbUrl) {
  if (!dbUrl.startsWith("file:")) {
    throw new Error(
      `Persistence smoke test requires a file: SQLite URL, received: ${dbUrl}`,
    );
  }

  const rawPath = decodeURIComponent(dbUrl.slice("file:".length));
  return resolve(process.cwd(), rawPath);
}

const previousDbUrl = process.env.SENCLAW_DB_URL;
const dbUrl = process.env.SENCLAW_DB_URL ?? "file:./senclaw.db";
const dbPath = resolveDbPath(dbUrl);
process.env.SENCLAW_DB_URL = dbUrl;

let firstApp;
let secondApp;

try {
  if (existsSync(dbPath)) {
    rmSync(dbPath, { force: true });
  }

  const firstServer = await createServer();
  firstApp = firstServer.app;
  await firstApp.ready();

  const createResponse = await firstApp.inject({
    method: "POST",
    url: "/api/v1/agents",
    payload: {
      name: "Persistent Agent",
      systemPrompt: "Remember this agent",
      provider: { provider: "openai", model: "gpt-4o" },
      tools: [],
    },
  });

  assert.equal(createResponse.statusCode, 201, createResponse.body);
  const createdAgent = createResponse.json();
  assert.ok(createdAgent.id, "Expected a persisted agent id");
  assert.ok(existsSync(dbPath), `Expected SQLite database at ${dbPath}`);

  await firstApp.close();
  firstApp = undefined;

  const secondServer = await createServer();
  secondApp = secondServer.app;
  await secondApp.ready();

  const listResponse = await secondApp.inject({
    method: "GET",
    url: "/api/v1/agents",
  });
  assert.equal(listResponse.statusCode, 200, listResponse.body);
  const listedAgents = listResponse.json();
  assert.ok(
    listedAgents.some(
      (agent) =>
        agent.id === createdAgent.id && agent.name === "Persistent Agent",
    ),
    "Expected the created agent to persist across server restart",
  );

  const healthResponse = await secondApp.inject({
    method: "GET",
    url: "/health",
  });
  assert.equal(healthResponse.statusCode, 200, healthResponse.body);
  const healthBody = healthResponse.json();
  assert.equal(healthBody.status, "healthy");
  assert.equal(healthBody.details?.storage?.status, "healthy");

  console.log(`Persistence smoke test passed with ${dbUrl}`);
} finally {
  if (firstApp) {
    await firstApp.close();
  }

  if (secondApp) {
    await secondApp.close();
  }

  if (previousDbUrl === undefined) {
    process.env.SENCLAW_DB_URL = undefined;
  } else {
    process.env.SENCLAW_DB_URL = previousDbUrl;
  }

  if (existsSync(dbPath)) {
    rmSync(dbPath, { force: true });
  }
}
