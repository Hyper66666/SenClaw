import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { z } from "zod/v4";

export const ConsoleLocaleSchema = z.enum(["en", "zh-CN"]);
export type ConsoleLocale = z.infer<typeof ConsoleLocaleSchema>;

export const DEFAULT_CONSOLE_LOCALE: ConsoleLocale = "en";
export const LOCAL_RUNTIME_AGENT_NAME = "SenClaw Assistant";
export const LOCAL_RUNTIME_AGENT_TOOLS = [
  "echo",
  "fs.read_text",
  "fs.read_dir",
  "fs.write_text",
  "shell.exec",
] as const;
export const DEFAULT_LOCAL_RUNTIME_SYSTEM_PROMPT =
  "You are SenClaw, a pragmatic local AI assistant. Use local filesystem and managed shell tools when they help, respect approval prompts, and explain clearly what you are doing.";

export interface LocalRuntimeProviderConfig {
  provider: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
}

export interface LocalRuntimeAgentSpec {
  name: string;
  systemPrompt: string;
  provider: LocalRuntimeProviderConfig;
  tools: string[];
}
export const RuntimeSettingsSchema = z.object({
  locale: ConsoleLocaleSchema.default(DEFAULT_CONSOLE_LOCALE),
});

export type RuntimeSettings = z.infer<typeof RuntimeSettingsSchema>;

export interface LocalRuntimeFiles {
  runtimeDir: string;
  settingsFile: string;
  adminKeyFile: string;
  gatewayPidFile: string;
  webPidFile: string;
  gatewayOutLog: string;
  gatewayErrLog: string;
  webOutLog: string;
  webErrLog: string;
  databaseFile: string;
}

export interface RuntimeProcessSpec {
  command: string;
  args: string[];
  cwd: string;
}

export interface PendingApprovalSummary {
  id: string;
  kind: "filesystem" | "shell";
  action: string;
  targetPaths: string[];
  reason: string;
  requestedBy: string;
}

export interface StartupBannerInput {
  locale: ConsoleLocale;
  model: string;
  adminKey: string;
  gatewayUrl: string;
  webUrl: string;
  autoLoginUrl: string;
  logDir: string;
  pendingApprovals?: PendingApprovalSummary[];
}

export function normalizeConsoleLocale(value: unknown): ConsoleLocale {
  const parsed = ConsoleLocaleSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_CONSOLE_LOCALE;
}

export function createDefaultLocalRuntimeAgent(
  provider: LocalRuntimeProviderConfig,
  existing?: Partial<Pick<LocalRuntimeAgentSpec, "systemPrompt" | "tools">>,
): LocalRuntimeAgentSpec {
  const mergedTools = [
    ...(existing?.tools ?? []),
    ...LOCAL_RUNTIME_AGENT_TOOLS,
  ].filter((tool, index, tools) => tools.indexOf(tool) === index);

  return {
    name: LOCAL_RUNTIME_AGENT_NAME,
    systemPrompt:
      existing?.systemPrompt?.trim() || DEFAULT_LOCAL_RUNTIME_SYSTEM_PROMPT,
    provider,
    tools: mergedTools,
  };
}

export function resolveLocalRuntimeFiles(
  workspaceRoot = process.cwd(),
): LocalRuntimeFiles {
  const runtimeDir = resolve(workspaceRoot, ".tmp", "live-run");
  return {
    runtimeDir,
    settingsFile: resolve(runtimeDir, "runtime-settings.json"),
    adminKeyFile: resolve(runtimeDir, "admin-key.txt"),
    gatewayPidFile: resolve(runtimeDir, "gateway.pid"),
    webPidFile: resolve(runtimeDir, "web.pid"),
    gatewayOutLog: resolve(runtimeDir, "gateway.out.log"),
    gatewayErrLog: resolve(runtimeDir, "gateway.err.log"),
    webOutLog: resolve(runtimeDir, "web.out.log"),
    webErrLog: resolve(runtimeDir, "web.err.log"),
    databaseFile: resolve(runtimeDir, "senclaw-live.db"),
  };
}

export function createWebRuntimeProcessSpec(
  workspaceRoot: string,
  webPort: string,
): RuntimeProcessSpec {
  const webRoot = resolve(workspaceRoot, "apps", "web");
  const webPackageJson = resolve(webRoot, "package.json");
  const webRequire = createRequire(webPackageJson);
  const vitePackageJson = webRequire.resolve("vite/package.json");
  const viteEntrypoint = resolve(dirname(vitePackageJson), "bin", "vite.js");

  return {
    command: process.execPath,
    args: [viteEntrypoint, "--host", "127.0.0.1", "--port", webPort],
    cwd: webRoot,
  };
}

export function ensureRuntimeDirectory(settingsFile: string): void {
  mkdirSync(dirname(settingsFile), { recursive: true });
}

export function readRuntimeSettings(settingsFile: string): RuntimeSettings {
  if (!existsSync(settingsFile)) {
    return { locale: DEFAULT_CONSOLE_LOCALE };
  }

  try {
    const raw = JSON.parse(readFileSync(settingsFile, "utf8")) as unknown;
    const parsed = RuntimeSettingsSchema.safeParse(raw);
    if (parsed.success) {
      return parsed.data;
    }
  } catch {
    // fall through to default
  }

  return { locale: DEFAULT_CONSOLE_LOCALE };
}

export function writeRuntimeSettings(
  settingsFile: string,
  settings: Partial<RuntimeSettings>,
): RuntimeSettings {
  const merged = RuntimeSettingsSchema.parse({
    ...readRuntimeSettings(settingsFile),
    ...settings,
  });

  ensureRuntimeDirectory(settingsFile);
  writeFileSync(settingsFile, `${JSON.stringify(merged, null, 2)}\n`, "utf8");
  return merged;
}

function renderPendingApprovalLines(
  locale: ConsoleLocale,
  approvals: PendingApprovalSummary[],
): string[] {
  if (approvals.length === 0) {
    return [];
  }

  const isZh = locale === "zh-CN";
  const lines = [
    isZh ? "\u5f85\u5904\u7406\u5ba1\u6279:" : "Pending approvals:",
  ];

  for (const approval of approvals) {
    const targets = approval.targetPaths.join(", ") || approval.requestedBy;
    lines.push(
      `- [${approval.id}] ${approval.kind}/${approval.action} -> ${targets}`,
    );
    lines.push(
      isZh
        ? `  \u539f\u56e0: ${approval.reason}`
        : `  Reason: ${approval.reason}`,
    );
    lines.push(
      isZh
        ? `  \u6279\u51c6: POST /api/runtime/approvals/${approval.id}/approve`
        : `  Approve: POST /api/runtime/approvals/${approval.id}/approve`,
    );
    lines.push(
      isZh
        ? `  \u62d2\u7edd: POST /api/runtime/approvals/${approval.id}/reject`
        : `  Reject: POST /api/runtime/approvals/${approval.id}/reject`,
    );
  }

  return lines;
}

export function createStartupBanner(input: StartupBannerInput): string {
  const isZh = input.locale === "zh-CN";
  const divider = "=".repeat(60);

  const lines = isZh
    ? [
        divider,
        "SenClaw \u5df2\u542f\u52a8",
        `\u6a21\u578b ID: ${input.model}`,
        `\u7ba1\u7406\u5bc6\u94a5: ${input.adminKey}`,
        `Web \u63a7\u5236\u53f0: ${input.webUrl}`,
        `Admin API: ${input.autoLoginUrl}`,
        `Gateway \u5730\u5740: ${input.gatewayUrl}`,
        `\u65e5\u5fd7\u76ee\u5f55: ${input.logDir}`,
      ]
    : [
        divider,
        "SenClaw is ready",
        `Model ID: ${input.model}`,
        `Admin Key: ${input.adminKey}`,
        `Web Console: ${input.webUrl}`,
        `Admin API: ${input.autoLoginUrl}`,
        `Gateway URL: ${input.gatewayUrl}`,
        `Log Directory: ${input.logDir}`,
      ];

  lines.push(
    ...renderPendingApprovalLines(input.locale, input.pendingApprovals ?? []),
  );
  lines.push(divider);

  return lines.join("\n");
}
