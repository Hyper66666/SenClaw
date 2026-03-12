import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { createServer } from "../apps/gateway/src/server.ts";
import { loadProviderSmokeConfig } from "../packages/config/src/index.ts";

type RunRecord = {
  id: string;
  status: string;
  error?: string;
};

type MessageRecord = {
  role: string;
  content: string;
};

async function main(): Promise<void> {
  const previousDbUrl = process.env.SENCLAW_DB_URL;
  const previousVitest = process.env.VITEST;
  process.env.SENCLAW_DB_URL = process.env.SENCLAW_DB_URL ?? ":memory:";
  process.env.VITEST = "1";

  const smokeConfig = loadProviderSmokeConfig();

  let app: Awaited<ReturnType<typeof createServer>>["app"] | undefined;

  try {
    const server = await createServer();
    app = server.app;
    await app.ready();

    const authHeaders = server.bootstrapAdminKey
      ? { authorization: `Bearer ${server.bootstrapAdminKey}` }
      : {};

    const createAgentResponse = await app.inject({
      method: "POST",
      url: "/api/v1/agents",
      headers: authHeaders,
      payload: {
        name: "Provider Smoke Agent",
        systemPrompt:
          "You are a smoke test assistant. Follow the user instruction exactly and keep the response minimal.",
        provider: {
          provider: "openai",
          model: smokeConfig.model,
        },
        tools: [],
      },
    });
    assert.equal(createAgentResponse.statusCode, 201, createAgentResponse.body);
    const agent = createAgentResponse.json();

    const submitTaskResponse = await app.inject({
      method: "POST",
      url: "/api/v1/tasks",
      headers: authHeaders,
      payload: {
        agentId: agent.id,
        input: smokeConfig.prompt,
      },
    });
    assert.equal(submitTaskResponse.statusCode, 201, submitTaskResponse.body);
    const run = submitTaskResponse.json() as RunRecord;

    const deadline = Date.now() + smokeConfig.timeoutMs;
    let finalRun: RunRecord | undefined;
    while (Date.now() < deadline) {
      const runResponse = await app.inject({
        method: "GET",
        url: `/api/v1/runs/${run.id}`,
        headers: authHeaders,
      });
      assert.equal(runResponse.statusCode, 200, runResponse.body);
      finalRun = runResponse.json() as RunRecord;
      if (!["pending", "running"].includes(finalRun.status)) {
        break;
      }
      await delay(1_000);
    }

    assert.ok(finalRun, "Expected a final run state");
    assert.notEqual(
      finalRun.status,
      "pending",
      "Run did not leave pending state",
    );
    assert.notEqual(
      finalRun.status,
      "running",
      "Run did not finish before timeout",
    );
    assert.equal(
      finalRun.status,
      "completed",
      finalRun.error ?? "Run did not complete",
    );

    const messagesResponse = await app.inject({
      method: "GET",
      url: `/api/v1/runs/${run.id}/messages`,
      headers: authHeaders,
    });
    assert.equal(messagesResponse.statusCode, 200, messagesResponse.body);
    const messages = messagesResponse.json() as MessageRecord[];
    const assistantMessage = [...messages]
      .reverse()
      .find((message) => message.role === "assistant");

    assert.ok(
      assistantMessage?.content,
      "Expected an assistant response in the completed run",
    );

    console.log(
      JSON.stringify(
        {
          status: finalRun.status,
          runId: run.id,
          model: smokeConfig.model,
          assistantResponse: assistantMessage.content,
        },
        null,
        2,
      ),
    );
  } finally {
    if (app) {
      await app.close();
    }

    if (previousDbUrl === undefined) {
      process.env.SENCLAW_DB_URL = undefined;
    } else {
      process.env.SENCLAW_DB_URL = previousDbUrl;
    }

    if (previousVitest === undefined) {
      process.env.VITEST = undefined;
    } else {
      process.env.VITEST = previousVitest;
    }
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
