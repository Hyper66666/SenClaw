import { existsSync } from "node:fs";
import { resolve } from "node:path";
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
  metricsEnabled: createBooleanEnvSchema(true),
  tracingEnabled: createBooleanEnvSchema(false),
  tracingEndpoint: z.preprocess(normalizeOptionalString, z.string().optional()),
  logSamplingRate: z.coerce.number().min(0).max(1).default(0.1),
  logDebugEndpoints: z.preprocess(normalizeStringList, z.array(z.string())),
  logDebugUsers: z.preprocess(normalizeStringList, z.array(z.string())),
});

export type SenclawConfig = z.infer<typeof SenclawConfigSchema>;

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
