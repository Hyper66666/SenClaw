import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { z } from "zod/v4";

export const ConsoleLocaleSchema = z.enum(["en", "zh-CN"]);
export type ConsoleLocale = z.infer<typeof ConsoleLocaleSchema>;

export const DEFAULT_CONSOLE_LOCALE: ConsoleLocale = "en";

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

export interface StartupBannerInput {
  locale: ConsoleLocale;
  model: string;
  adminKey: string;
  gatewayUrl: string;
  webUrl: string;
  logDir: string;
}

export function normalizeConsoleLocale(value: unknown): ConsoleLocale {
  const parsed = ConsoleLocaleSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_CONSOLE_LOCALE;
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
        `Gateway \u5730\u5740: ${input.gatewayUrl}`,
        `\u65e5\u5fd7\u76ee\u5f55: ${input.logDir}`,
        divider,
      ]
    : [
        divider,
        "SenClaw is ready",
        `Model ID: ${input.model}`,
        `Admin Key: ${input.adminKey}`,
        `Web Console: ${input.webUrl}`,
        `Gateway URL: ${input.gatewayUrl}`,
        `Log Directory: ${input.logDir}`,
        divider,
      ];

  return lines.join("\n");
}
