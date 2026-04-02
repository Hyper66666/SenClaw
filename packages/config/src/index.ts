import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import type { AgentDefinition } from "@senclaw/protocol";
import { config as loadDotenv } from "dotenv";
import { z } from "zod/v4";

function normalizeOptionalString(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  const normalized = value.trim();
  if (
    normalized.length === 0 ||
    normalized.toLowerCase() === "undefined" ||
    normalized.toLowerCase() === "null"
  ) {
    return undefined;
  }

  return normalized;
}

function normalizeStringList(value: unknown): unknown {
  const normalized = normalizeOptionalString(value);
  if (normalized === undefined) {
    return [];
  }

  if (Array.isArray(normalized)) {
    return normalized;
  }

  if (typeof normalized !== "string") {
    return normalized;
  }

  return normalized
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function createBooleanEnvSchema(defaultValue: boolean) {
  return z.preprocess((value) => {
    if (value === undefined) {
      return defaultValue;
    }

    if (typeof value === "boolean") {
      return value;
    }

    if (typeof value !== "string") {
      return value;
    }

    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) {
      return true;
    }

    if (["0", "false", "no", "off"].includes(normalized)) {
      return false;
    }

    return value;
  }, z.boolean());
}

export const GlobalFilesystemPermissionsConfigSchema = z.object({
  allowAllWrites: z.boolean().default(false),
  writeAllowedPaths: z.array(z.string()).default([]),
  promptForElevation: z.boolean().default(true),
});

export type GlobalFilesystemPermissionsConfig = z.infer<
  typeof GlobalFilesystemPermissionsConfigSchema
>;

export const GlobalShellPermissionsConfigSchema = z.object({
  enabled: z.boolean().default(true),
  enforcementMode: z.enum(["managed"]).default("managed"),
  promptForElevation: z.boolean().default(true),
});

export type GlobalShellPermissionsConfig = z.infer<
  typeof GlobalShellPermissionsConfigSchema
>;

export const GlobalPermissionsConfigSchema = z.object({
  filesystem: GlobalFilesystemPermissionsConfigSchema.default({
    allowAllWrites: false,
    writeAllowedPaths: [],
    promptForElevation: true,
  }),
  shell: GlobalShellPermissionsConfigSchema.default({
    enabled: true,
    enforcementMode: "managed",
    promptForElevation: true,
  }),
});

export type GlobalPermissionsConfig = z.infer<
  typeof GlobalPermissionsConfigSchema
>;

export const DEFAULT_GLOBAL_PERMISSIONS: GlobalPermissionsConfig =
  GlobalPermissionsConfigSchema.parse({});

const GLOBAL_CONFIG_FILE = resolve(homedir(), ".senclawrc");

const GlobalCliConfigSchema = z.object({
  permissions: GlobalPermissionsConfigSchema.optional(),
});

const AgentDefinitionConfigSchema = z.object({
  name: z.string().min(1),
  systemPrompt: z.string().min(1),
  provider: z.object({
    provider: z.string().min(1),
    model: z.string().min(1),
    temperature: z.number().optional(),
    maxTokens: z.number().int().positive().optional(),
  }),
  tools: z.array(z.string()).default([]),
  effort: z.enum(["low", "medium", "high"]).default("medium"),
  isolation: z.enum(["shared", "isolated"]).default("shared"),
  permissionMode: z.string().min(1).default("default"),
  maxTurns: z.number().int().positive().optional(),
  background: z.boolean().default(false),
});

const AgentDefinitionsFileSchema = z.object({
  agents: z.array(AgentDefinitionConfigSchema).default([]),
});

export interface LoadAgentDefinitionsOptions {
  workspaceRoot?: string;
  builtInAgents?: AgentDefinition[];
  userConfigFile?: string;
  projectConfigFile?: string;
}

export function resolveUserAgentDefinitionsFile(): string {
  return resolve(homedir(), ".senclaw", "agents.json");
}

export function resolveProjectAgentDefinitionsFile(
  workspaceRoot = process.cwd(),
): string {
  return resolve(workspaceRoot, ".senclaw", "agents.json");
}

function readAgentDefinitionFile(filePath: string): AgentDefinition[] {
  if (!existsSync(filePath)) {
    return [];
  }

  const raw = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
  return AgentDefinitionsFileSchema.parse(raw).agents;
}

function mergeAgentDefinitions(
  base: AgentDefinition[],
  overrides: AgentDefinition[],
): AgentDefinition[] {
  const merged = new Map(base.map((agent) => [agent.name, agent]));
  for (const agent of overrides) {
    merged.set(agent.name, agent);
  }
  return Array.from(merged.values());
}

export function loadAgentDefinitions(
  options: LoadAgentDefinitionsOptions = {},
): AgentDefinition[] {
  const userFile = options.userConfigFile ?? resolveUserAgentDefinitionsFile();
  const projectFile =
    options.projectConfigFile ??
    resolveProjectAgentDefinitionsFile(options.workspaceRoot);

  const builtIn = options.builtInAgents ?? [];
  const userAgents = readAgentDefinitionFile(userFile);
  const projectAgents = readAgentDefinitionFile(projectFile);

  return mergeAgentDefinitions(
    mergeAgentDefinitions(builtIn, userAgents),
    projectAgents,
  );
}

const SenclawConfigSchema = z.object({
  logLevel: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal"])
    .default("info"),
  gatewayPort: z.coerce.number().int().positive().default(4100),
  agentRunnerPort: z.coerce.number().int().positive().default(4200),
  toolRunnerPort: z.coerce.number().int().positive().default(4400),
  maxTurns: z.coerce.number().int().positive().default(10),
  llmTimeoutMs: z.coerce.number().int().positive().default(30_000),
  toolTimeoutMs: z.coerce.number().int().positive().default(10_000),
  dbUrl: z.preprocess(normalizeOptionalString, z.string().optional()),
  rateLimitAdmin: z.coerce.number().int().positive().default(1000),
  rateLimitUser: z.coerce.number().int().positive().default(100),
  rateLimitReadonly: z.coerce.number().int().positive().default(50),
  auditLogRetentionDays: z.coerce.number().int().positive().default(90),
  schedulerTickIntervalMs: z.coerce.number().int().min(1000).default(10_000),
  metricsEnabled: createBooleanEnvSchema(true),
  tracingEnabled: createBooleanEnvSchema(false),
  tracingEndpoint: z.preprocess(normalizeOptionalString, z.string().optional()),
  logSamplingRate: z.coerce.number().min(0).max(1).default(0.1),
  logDebugEndpoints: z.preprocess(normalizeStringList, z.array(z.string())),
  logDebugUsers: z.preprocess(normalizeStringList, z.array(z.string())),
});

export type SenclawConfig = z.infer<typeof SenclawConfigSchema>;

const ProviderSmokeConfigSchema = z.object({
  apiKey: z.string().min(1),
  baseURL: z.string().url(),
  model: z.string().min(1),
  prompt: z.string().min(1).default("Reply with the single word OK."),
  timeoutMs: z.coerce.number().int().positive().default(60_000),
});

export type ProviderSmokeConfig = z.infer<typeof ProviderSmokeConfigSchema>;

const PROVIDER_SMOKE_ENV_KEY_MAP = {
  apiKey: "SENCLAW_OPENAI_API_KEY",
  baseURL: "SENCLAW_OPENAI_BASE_URL",
  model: "SENCLAW_OPENAI_MODEL",
  prompt: "SENCLAW_SMOKE_PROMPT",
  timeoutMs: "SENCLAW_SMOKE_TIMEOUT_MS",
} as const satisfies Record<keyof ProviderSmokeConfig, string>;

const ENV_KEY_MAP: Record<keyof SenclawConfig, string> = {
  logLevel: "SENCLAW_LOG_LEVEL",
  gatewayPort: "SENCLAW_GATEWAY_PORT",
  agentRunnerPort: "SENCLAW_AGENT_RUNNER_PORT",
  toolRunnerPort: "SENCLAW_TOOL_RUNNER_PORT",
  maxTurns: "SENCLAW_MAX_TURNS",
  llmTimeoutMs: "SENCLAW_LLM_TIMEOUT_MS",
  toolTimeoutMs: "SENCLAW_TOOL_TIMEOUT_MS",
  dbUrl: "SENCLAW_DB_URL",
  rateLimitAdmin: "SENCLAW_RATE_LIMIT_ADMIN",
  rateLimitUser: "SENCLAW_RATE_LIMIT_USER",
  rateLimitReadonly: "SENCLAW_RATE_LIMIT_READONLY",
  auditLogRetentionDays: "SENCLAW_AUDIT_LOG_RETENTION_DAYS",
  schedulerTickIntervalMs: "SENCLAW_SCHEDULER_TICK_INTERVAL_MS",
  metricsEnabled: "SENCLAW_METRICS_ENABLED",
  tracingEnabled: "SENCLAW_TRACING_ENABLED",
  tracingEndpoint: "SENCLAW_TRACING_ENDPOINT",
  logSamplingRate: "SENCLAW_LOG_SAMPLING_RATE",
  logDebugEndpoints: "SENCLAW_LOG_DEBUG_ENDPOINTS",
  logDebugUsers: "SENCLAW_LOG_DEBUG_USERS",
};

function readEnvValues(): Record<string, unknown> {
  const raw: Record<string, unknown> = {};
  for (const [key, envName] of Object.entries(ENV_KEY_MAP)) {
    const value = process.env[envName];
    if (value !== undefined) {
      raw[key] = value;
    }
  }
  return raw;
}

export function loadProviderSmokeConfig(
  env: NodeJS.ProcessEnv = process.env,
): ProviderSmokeConfig {
  const raw = {
    apiKey: normalizeOptionalString(env.SENCLAW_OPENAI_API_KEY),
    baseURL: normalizeOptionalString(env.SENCLAW_OPENAI_BASE_URL),
    model: normalizeOptionalString(env.SENCLAW_OPENAI_MODEL),
    prompt: normalizeOptionalString(env.SENCLAW_SMOKE_PROMPT),
    timeoutMs: env.SENCLAW_SMOKE_TIMEOUT_MS,
  };

  const result = ProviderSmokeConfigSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => {
        const field = issue.path.join(".") as keyof ProviderSmokeConfig;
        const envVar = PROVIDER_SMOKE_ENV_KEY_MAP[field] ?? field;
        return `  ${envVar}: ${issue.message}`;
      })
      .join("\n");
    throw new Error(`Invalid provider smoke configuration:\n${issues}`);
  }

  return result.data;
}

export function loadConfig(workspaceRoot?: string): SenclawConfig {
  const root = workspaceRoot ?? process.cwd();
  const envPath = resolve(root, ".env");
  if (existsSync(envPath)) {
    loadDotenv({ path: envPath });
  }

  const raw = readEnvValues();
  const result = SenclawConfigSchema.safeParse(raw);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => {
        const field = issue.path.join(".");
        const envVar = ENV_KEY_MAP[field as keyof SenclawConfig] ?? field;
        return `  ${envVar}: ${issue.message}`;
      })
      .join("\n");
    throw new Error(`Invalid configuration:\n${issues}`);
  }

  return result.data;
}

export function loadGlobalPermissionsConfig(
  configFile = GLOBAL_CONFIG_FILE,
): GlobalPermissionsConfig {
  try {
    if (!existsSync(configFile)) {
      return DEFAULT_GLOBAL_PERMISSIONS;
    }

    const raw = JSON.parse(readFileSync(configFile, "utf8")) as unknown;
    const parsed = GlobalCliConfigSchema.safeParse(raw);
    if (!parsed.success) {
      return DEFAULT_GLOBAL_PERMISSIONS;
    }

    return parsed.data.permissions ?? DEFAULT_GLOBAL_PERMISSIONS;
  } catch {
    return DEFAULT_GLOBAL_PERMISSIONS;
  }
}

export {
  ConsoleLocaleSchema,
  DEFAULT_CONSOLE_LOCALE,
  DEFAULT_LOCAL_RUNTIME_SYSTEM_PROMPT,
  LOCAL_RUNTIME_AGENT_NAME,
  LOCAL_RUNTIME_AGENT_TOOLS,
  RuntimeSettingsSchema,
  createDefaultLocalRuntimeAgent,
  createStartupBanner,
  createWebRuntimeProcessSpec,
  ensureRuntimeDirectory,
  normalizeConsoleLocale,
  readRuntimeSettings,
  resolveLocalRuntimeFiles,
  writeRuntimeSettings,
} from "./local-runtime.js";
export type {
  ConsoleLocale,
  LocalRuntimeFiles,
  PendingApprovalSummary,
  RuntimeProcessSpec,
  RuntimeSettings,
  StartupBannerInput,
} from "./local-runtime.js";
export { evaluateLocalPermission } from "./permissions.js";
export type {
  EvaluateLocalPermissionInput,
  LocalPermissionAction,
  LocalPermissionDecision,
  LocalPermissionOutcome,
} from "./permissions.js";
