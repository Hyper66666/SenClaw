import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface FilesystemPermissionsConfig {
  allowAllWrites: boolean;
  writeAllowedPaths: string[];
  promptForElevation: boolean;
}

export interface ShellPermissionsConfig {
  enabled: boolean;
  enforcementMode: "managed";
  promptForElevation: boolean;
}

export interface PermissionsConfig {
  filesystem: FilesystemPermissionsConfig;
  shell: ShellPermissionsConfig;
}

export interface Config {
  gatewayUrl?: string;
  apiKey?: string;
  permissions: PermissionsConfig;
}

export const DEFAULT_PERMISSIONS: PermissionsConfig = {
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
};

const DEFAULT_CONFIG_FILE = path.join(os.homedir(), ".senclawrc");

function resolveConfigFile(configFile?: string): string {
  return configFile ?? DEFAULT_CONFIG_FILE;
}

function normalizeOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function normalizePermissions(value: unknown): PermissionsConfig {
  const raw =
    value && typeof value === "object"
      ? (value as Partial<PermissionsConfig>)
      : undefined;

  const filesystemRaw = raw?.filesystem;
  const shellRaw = raw?.shell;

  return {
    filesystem: {
      allowAllWrites:
        typeof filesystemRaw?.allowAllWrites === "boolean"
          ? filesystemRaw.allowAllWrites
          : DEFAULT_PERMISSIONS.filesystem.allowAllWrites,
      writeAllowedPaths: normalizeStringArray(filesystemRaw?.writeAllowedPaths),
      promptForElevation:
        typeof filesystemRaw?.promptForElevation === "boolean"
          ? filesystemRaw.promptForElevation
          : DEFAULT_PERMISSIONS.filesystem.promptForElevation,
    },
    shell: {
      enabled:
        typeof shellRaw?.enabled === "boolean"
          ? shellRaw.enabled
          : DEFAULT_PERMISSIONS.shell.enabled,
      enforcementMode:
        shellRaw?.enforcementMode === "managed"
          ? "managed"
          : DEFAULT_PERMISSIONS.shell.enforcementMode,
      promptForElevation:
        typeof shellRaw?.promptForElevation === "boolean"
          ? shellRaw.promptForElevation
          : DEFAULT_PERMISSIONS.shell.promptForElevation,
    },
  };
}

function normalizeConfig(value: unknown): Config {
  const raw =
    value && typeof value === "object" ? (value as Partial<Config>) : {};

  return {
    gatewayUrl: normalizeOptionalString(raw.gatewayUrl),
    apiKey: normalizeOptionalString(raw.apiKey),
    permissions: normalizePermissions(raw.permissions),
  };
}

export function loadConfig(configFile?: string): Config {
  const resolvedConfigFile = resolveConfigFile(configFile);

  try {
    if (fs.existsSync(resolvedConfigFile)) {
      const content = fs.readFileSync(resolvedConfigFile, "utf-8");
      return normalizeConfig(JSON.parse(content));
    }
  } catch {
    // Ignore errors, return defaults
  }

  return normalizeConfig({});
}

export function saveConfig(config: Config, configFile?: string): void {
  const resolvedConfigFile = resolveConfigFile(configFile);
  const normalized = normalizeConfig(config);
  fs.mkdirSync(path.dirname(resolvedConfigFile), { recursive: true });
  fs.writeFileSync(resolvedConfigFile, JSON.stringify(normalized, null, 2));
}

export function getConfigValue(
  key: "gatewayUrl" | "apiKey",
  configFile?: string,
): string | undefined {
  const config = loadConfig(configFile);
  return config[key];
}

export function setConfigValue(
  key: "gatewayUrl" | "apiKey",
  value: string,
  configFile?: string,
): void {
  const config = loadConfig(configFile);
  config[key] = value;
  saveConfig(config, configFile);
}
