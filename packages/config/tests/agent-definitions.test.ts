import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadAgentDefinitions } from "../src/index.js";

const tempDirs: string[] = [];

function createTempAgentFile(contents?: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), "senclaw-agents-"));
  tempDirs.push(dir);
  const configDir = join(dir, ".senclaw");
  mkdirSync(configDir, { recursive: true });
  const file = join(configDir, "agents.json");
  if (contents !== undefined) {
    writeFileSync(file, JSON.stringify(contents, null, 2), "utf8");
  }
  return file;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("loadAgentDefinitions", () => {
  const builtInAgent = {
    name: "SenClaw Assistant",
    systemPrompt: "Be helpful",
    provider: { provider: "openai", model: "gpt-4o" },
    tools: ["echo"],
    effort: "medium" as const,
    isolation: "shared" as const,
    permissionMode: "default",
    background: true,
  };

  it("returns built-in definitions when no user or project file exists", () => {
    const result = loadAgentDefinitions({
      builtInAgents: [builtInAgent],
      userConfigFile: "__missing__",
      projectConfigFile: "__missing__",
    });

    expect(result).toEqual([builtInAgent]);
  });

  it("lets project definitions override user and built-in definitions by name", () => {
    const userFile = createTempAgentFile({
      agents: [
        {
          ...builtInAgent,
          systemPrompt: "User override",
          tools: ["echo", "fs.read_text"],
        },
        {
          name: "Research Agent",
          systemPrompt: "Research deeply",
          provider: { provider: "openai", model: "gpt-4o-mini" },
          tools: ["echo"],
          effort: "high",
          isolation: "isolated",
          permissionMode: "default",
          background: false,
        },
      ],
    });
    const projectFile = createTempAgentFile({
      agents: [
        {
          ...builtInAgent,
          systemPrompt: "Project override",
          tools: ["echo", "shell.exec"],
        },
      ],
    });

    const result = loadAgentDefinitions({
      builtInAgents: [builtInAgent],
      userConfigFile: userFile,
      projectConfigFile: projectFile,
    });

    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "SenClaw Assistant",
          systemPrompt: "Project override",
          tools: ["echo", "shell.exec"],
        }),
        expect.objectContaining({ name: "Research Agent" }),
      ]),
    );
  });

  it("throws when a user or project agent definition is invalid", () => {
    const userFile = createTempAgentFile({
      agents: [
        {
          name: "Broken Agent",
          provider: { provider: "openai", model: "gpt-4o" },
        },
      ],
    });

    expect(() =>
      loadAgentDefinitions({
        builtInAgents: [builtInAgent],
        userConfigFile: userFile,
        projectConfigFile: "__missing__",
      }),
    ).toThrow();
  });
});
