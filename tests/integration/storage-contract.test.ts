import { describe, expect, it } from "vitest";
import type {
  Agent,
  CreateAgent,
  IAgentRepository,
  IMessageRepository,
  IRunRepository,
  Message,
  Run,
} from "../../packages/protocol/src/index";
import {
  InMemoryAgentRepository,
  InMemoryMessageRepository,
  InMemoryRunRepository,
} from "../../apps/agent-runner/src/index";
import { createStorage } from "../../packages/storage/src/index";

interface RepositoryHarness {
  agents: IAgentRepository;
  runs: IRunRepository;
  messages: IMessageRepository;
  dispose(): Promise<void>;
}

interface ScenarioResult {
  missingAgent: Agent | undefined;
  createdAgent: Agent;
  fetchedAgent: Agent | undefined;
  listedAgents: Agent[];
  deletedMissingAgent: boolean;
  deletedCreatedAgent: boolean;
  missingAfterDelete: Agent | undefined;
  emptyMessages: Message[];
  createdRun: Run;
  fetchedRun: Run | undefined;
  runList: Run[];
  updatedRun: Run | undefined;
  missingRun: Run | undefined;
  storedMessages: Message[];
}

function createInMemoryHarness(): RepositoryHarness {
  return {
    agents: new InMemoryAgentRepository(),
    runs: new InMemoryRunRepository(),
    messages: new InMemoryMessageRepository(),
    dispose: async () => {},
  };
}

function createSqliteHarness(): RepositoryHarness {
  const storage = createStorage(":memory:");
  return {
    agents: storage.agents,
    runs: storage.runs,
    messages: storage.messages,
    dispose: async () => {
      storage.close();
    },
  };
}

async function exerciseRepositories(
  harness: RepositoryHarness,
): Promise<ScenarioResult> {
  const agentInput: CreateAgent = {
    name: "Contract Agent",
    systemPrompt: "Stay consistent",
    provider: { provider: "openai", model: "gpt-4o" },
    tools: ["echo"],
  };

  const missingAgent = await harness.agents.get("missing-agent");
  const createdAgent = await harness.agents.create(agentInput);
  const fetchedAgent = await harness.agents.get(createdAgent.id);
  const listedAgents = await harness.agents.list();
  const deletedMissingAgent = await harness.agents.delete("missing-agent");

  const emptyMessages = await harness.messages.listByRunId("missing-run");
  const createdRun = await harness.runs.create(
    createdAgent.id,
    "Hello from contract test",
  );
  const fetchedRun = await harness.runs.get(createdRun.id);
  const runList = await harness.runs.list();
  const updatedRun = await harness.runs.updateStatus(
    createdRun.id,
    "failed",
    "contract failure",
  );
  const missingRun = await harness.runs.updateStatus(
    "missing-run",
    "completed",
  );

  await harness.messages.append(createdRun.id, {
    role: "system",
    content: "System prompt",
  });
  await harness.messages.append(createdRun.id, {
    role: "user",
    content: "Hello from contract test",
  });
  await harness.messages.append(createdRun.id, {
    role: "assistant",
    content: "Calling echo",
    toolCalls: [
      {
        toolCallId: "call-1",
        toolName: "echo",
        args: { text: "Hello from contract test" },
      },
    ],
  });
  await harness.messages.append(createdRun.id, {
    role: "tool",
    toolCallId: "call-1",
    content: "Hello from contract test",
  });

  const storedMessages = await harness.messages.listByRunId(createdRun.id);
  const deletedCreatedAgent = await harness.agents.delete(createdAgent.id);
  const missingAfterDelete = await harness.agents.get(createdAgent.id);

  return {
    missingAgent,
    createdAgent,
    fetchedAgent,
    listedAgents,
    deletedMissingAgent,
    deletedCreatedAgent,
    missingAfterDelete,
    emptyMessages,
    createdRun,
    fetchedRun,
    runList,
    updatedRun,
    missingRun,
    storedMessages,
  };
}

function normalizeScenario(result: ScenarioResult) {
  return {
    missingAgent: result.missingAgent,
    createdAgent: {
      ...result.createdAgent,
      id: "<agent-id>",
    },
    fetchedAgent: result.fetchedAgent
      ? {
          ...result.fetchedAgent,
          id: "<agent-id>",
        }
      : undefined,
    listedAgents: result.listedAgents.map((agent) => ({
      ...agent,
      id: "<agent-id>",
    })),
    deletedMissingAgent: result.deletedMissingAgent,
    deletedCreatedAgent: result.deletedCreatedAgent,
    missingAfterDelete: result.missingAfterDelete,
    emptyMessages: result.emptyMessages,
    createdRun: {
      ...result.createdRun,
      id: "<run-id>",
      agentId: "<agent-id>",
      createdAt: "<created-at>",
      updatedAt: "<updated-at>",
    },
    fetchedRun: result.fetchedRun
      ? {
          ...result.fetchedRun,
          id: "<run-id>",
          agentId: "<agent-id>",
          createdAt: "<created-at>",
          updatedAt: "<updated-at>",
        }
      : undefined,
    runList: result.runList.map((run) => ({
      ...run,
      id: "<run-id>",
      agentId: "<agent-id>",
      createdAt: "<created-at>",
      updatedAt: "<updated-at>",
    })),
    updatedRun: result.updatedRun
      ? {
          ...result.updatedRun,
          id: "<run-id>",
          agentId: "<agent-id>",
          createdAt: "<created-at>",
          updatedAt: "<updated-at>",
        }
      : undefined,
    missingRun: result.missingRun,
    storedMessages: result.storedMessages,
  };
}

describe("storage repository contract", () => {
  it("matches the in-memory behavior with the SQLite implementation", async () => {
    const inMemory = createInMemoryHarness();
    const sqlite = createSqliteHarness();

    try {
      const inMemoryResult = await exerciseRepositories(inMemory);
      const sqliteResult = await exerciseRepositories(sqlite);

      expect(normalizeScenario(sqliteResult)).toEqual(
        normalizeScenario(inMemoryResult),
      );
    } finally {
      await inMemory.dispose();
      await sqlite.dispose();
    }
  });
});
