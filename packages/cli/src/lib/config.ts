import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export interface Config {
  gatewayUrl?: string;
  apiKey?: string;
}

const CONFIG_FILE = path.join(os.homedir(), ".senclawrc");

export function loadConfig(): Config {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const content = fs.readFileSync(CONFIG_FILE, "utf-8");
      return JSON.parse(content);
    }
  } catch (error) {
    // Ignore errors, return empty config
  }
  return {};
}

export function saveConfig(config: Config): void {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

export function getConfigValue(key: keyof Config): string | undefined {
  const config = loadConfig();
  return config[key];
}

export function setConfigValue(key: keyof Config, value: string): void {
  const config = loadConfig();
  config[key] = value;
  saveConfig(config);
}
