import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig, saveConfig, type Config } from "../src/lib/config.js";

const tempDirs: string[] = [];

function createTempConfigFile(): string {
  const dir = mkdtempSync(join(tmpdir(), "senclaw-cli-config-"));
  tempDirs.push(dir);
  return join(dir, ".senclawrc");
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { force: true, recursive: true });
    }
  }
});

describe("CLI config permissions", () => {
  it("returns default permissions when the config file does not exist", () => {
    const config = loadConfig(createTempConfigFile());

    expect(config.permissions).toEqual({
      filesystem: {
        allowAllWrites: false,
        writeAllowedPaths: [],
        promptForElevation: true,
      },
      shell: {
        enabled: true,
        enforcementMode: "managed",
        promptForElevation: true,
      },
    });
  });

  it("persists permissions to the user config file", () => {
    const configFile = createTempConfigFile();
    const config: Config = {
      gatewayUrl: "http://localhost:18789",
      apiKey: "sk_test",
      permissions: {
        filesystem: {
          allowAllWrites: false,
          writeAllowedPaths: ["D:\\work"],
          promptForElevation: true,
        },
        shell: {
          enabled: true,
          enforcementMode: "managed",
          promptForElevation: false,
        },
      },
    };

    saveConfig(config, configFile);

    expect(loadConfig(configFile)).toEqual(config);
    expect(JSON.parse(readFileSync(configFile, "utf8"))).toEqual(config);
  });
});
