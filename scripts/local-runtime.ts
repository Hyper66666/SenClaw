import { spawn, spawnSync } from "node:child_process";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig, loadProviderSmokeConfig } from "@senclaw/config";
import {
  createStartupBanner,
  readRuntimeSettings,
  resolveLocalRuntimeFiles,
  writeRuntimeSettings,
} from "@senclaw/config";
import { createStorage } from "@senclaw/storage";
import { ApiKeyService } from "../apps/gateway/src/auth/api-key-service.js";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const runtimeFiles = resolveLocalRuntimeFiles(workspaceRoot);
const corepackCommand =
  process.platform === "win32" ? "corepack.cmd" : "corepack";

function getGatewayPort(): string {
  return process.env.SENCLAW_GATEWAY_PORT ?? "4100";
}

function getWebPort(): string {
  return process.env.SENCLAW_WEB_PORT ?? "3000";
}

function getGatewayUrl(): string {
  return `http://localhost:${getGatewayPort()}`;
}

function getWebUrl(): string {
  return `http://localhost:${getWebPort()}`;
}

function readPidFile(filePath: string): number | undefined {
  if (!existsSync(filePath)) {
    return undefined;
  }

  const raw = readFileSync(filePath, "utf8").trim();
  const pid = Number.parseInt(raw, 10);
  return Number.isFinite(pid) ? pid : undefined;
}

function isProcessAlive(pid: number | undefined): boolean {
  if (!pid) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function isHttpReachable(url: string): Promise<boolean> {
  try {
    const response = await fetch(url);
    return response.ok || response.status < 500;
  } catch {
    return false;
  }
}

async function waitForUrl(url: string, timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isHttpReachable(url)) {
      return;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
  }

  throw new Error(`Timed out waiting for ${url}`);
}

function buildWorkspace(): void {
  const result = spawnSync(corepackCommand, ["pnpm", "run", "build"], {
    cwd: workspaceRoot,
    stdio: "inherit",
    env: process.env,
  });

  if (result.status !== 0) {
    throw new Error("Build failed. See output above.");
  }
}

async function ensureAdminKey(dbUrl: string): Promise<string> {
  mkdirSync(runtimeFiles.runtimeDir, { recursive: true });

  if (existsSync(runtimeFiles.adminKeyFile)) {
    return readFileSync(runtimeFiles.adminKeyFile, "utf8").trim();
  }

  const storage = createStorage(dbUrl);

  try {
    const apiKeyService = new ApiKeyService(storage.apiKeys);
    const bootstrapKey = await apiKeyService.ensureBootstrapAdminKey({
      print: false,
    });
    const adminKey =
      bootstrapKey ??
      (
        await apiKeyService.createApiKey({
          name: "Local Runtime Admin Key",
          role: "admin",
          createdBy: "system",
          expiresAt: null,
        })
      ).rawKey;

    writeFileSync(runtimeFiles.adminKeyFile, `${adminKey}\n`, "utf8");
    return adminKey;
  } finally {
    storage.close();
  }
}

function spawnBackgroundProcess(
  command: string,
  args: string[],
  logFile: string,
  errorFile: string,
  env: NodeJS.ProcessEnv,
): number {
  const stdout = openSync(logFile, "a");
  const stderr = openSync(errorFile, "a");
  const child = spawn(command, args, {
    cwd: workspaceRoot,
    env,
    detached: true,
    stdio: ["ignore", stdout, stderr],
  });

  child.unref();
  closeSync(stdout);
  closeSync(stderr);

  if (!child.pid) {
    throw new Error(`Failed to start ${command}`);
  }

  return child.pid;
}

async function ensureNoUntrackedCollision(
  service: "gateway" | "web",
): Promise<void> {
  const pidFile =
    service === "gateway"
      ? runtimeFiles.gatewayPidFile
      : runtimeFiles.webPidFile;
  const url = service === "gateway" ? `${getGatewayUrl()}/health` : getWebUrl();
  const trackedPid = readPidFile(pidFile);

  if (isProcessAlive(trackedPid)) {
    return;
  }

  if (existsSync(pidFile)) {
    rmSync(pidFile, { force: true });
  }

  if (await isHttpReachable(url)) {
    throw new Error(
      `Detected an untracked ${service} process on ${url}. Stop it first or use the launcher stop script if it was started by SenClaw.`,
    );
  }
}

async function start(): Promise<void> {
  loadConfig(workspaceRoot);
  const provider = loadProviderSmokeConfig(process.env);
  const gatewayPort = getGatewayPort();
  const webPort = getWebPort();
  const gatewayUrl = getGatewayUrl();
  const webUrl = getWebUrl();
  const settings = existsSync(runtimeFiles.settingsFile)
    ? readRuntimeSettings(runtimeFiles.settingsFile)
    : writeRuntimeSettings(runtimeFiles.settingsFile, { locale: "en" });
  const dbUrl = `file:${runtimeFiles.databaseFile}`;
  const adminKey = await ensureAdminKey(dbUrl);

  await ensureNoUntrackedCollision("gateway");
  await ensureNoUntrackedCollision("web");

  const existingGatewayPid = readPidFile(runtimeFiles.gatewayPidFile);
  const existingWebPid = readPidFile(runtimeFiles.webPidFile);
  const shouldStartGateway = !isProcessAlive(existingGatewayPid);
  const shouldStartWeb = !isProcessAlive(existingWebPid);
  const reusedGatewayPid = existingGatewayPid;
  const reusedWebPid = existingWebPid;

  if (!shouldStartGateway && reusedGatewayPid === undefined) {
    throw new Error("Tracked gateway PID is missing.");
  }

  if (!shouldStartWeb && reusedWebPid === undefined) {
    throw new Error("Tracked web PID is missing.");
  }

  if (shouldStartGateway || shouldStartWeb) {
    buildWorkspace();
  }

  const env = {
    ...process.env,
    SENCLAW_DB_URL: dbUrl,
    SENCLAW_GATEWAY_PORT: gatewayPort,
    SENCLAW_OPENAI_API_KEY: provider.apiKey,
    SENCLAW_OPENAI_BASE_URL: provider.baseURL,
    SENCLAW_OPENAI_MODEL: provider.model,
  };

  const gatewayPid = shouldStartGateway
    ? spawnBackgroundProcess(
        process.execPath,
        ["apps/gateway/dist/index.js"],
        runtimeFiles.gatewayOutLog,
        runtimeFiles.gatewayErrLog,
        env,
      )
    : reusedGatewayPid;
  writeFileSync(runtimeFiles.gatewayPidFile, `${gatewayPid}\n`, "utf8");

  const webPid = shouldStartWeb
    ? spawnBackgroundProcess(
        corepackCommand,
        [
          "pnpm",
          "--filter",
          "@senclaw/web",
          "exec",
          "vite",
          "--host",
          "127.0.0.1",
          "--port",
          webPort,
        ],
        runtimeFiles.webOutLog,
        runtimeFiles.webErrLog,
        env,
      )
    : reusedWebPid;
  writeFileSync(runtimeFiles.webPidFile, `${webPid}\n`, "utf8");

  await waitForUrl(`${gatewayUrl}/health`);
  await waitForUrl(webUrl);

  console.log(
    createStartupBanner({
      locale: settings.locale,
      model: provider.model,
      adminKey,
      gatewayUrl,
      webUrl,
      logDir: runtimeFiles.runtimeDir,
    }),
  );
}

function stopTrackedProcess(pidFile: string): void {
  const pid = readPidFile(pidFile);
  if (isProcessAlive(pid)) {
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
        stdio: "ignore",
      });
    } else {
      process.kill(pid);
    }
  }

  if (existsSync(pidFile)) {
    unlinkSync(pidFile);
  }
}

function stop(): void {
  const locale = readRuntimeSettings(runtimeFiles.settingsFile).locale;
  stopTrackedProcess(runtimeFiles.webPidFile);
  stopTrackedProcess(runtimeFiles.gatewayPidFile);

  if (locale === "zh-CN") {
    console.log("SenClaw 已停止。");
    return;
  }

  console.log("SenClaw stopped.");
}

const command = process.argv[2] ?? "start";

if (command === "start") {
  start().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
} else if (command === "stop") {
  stop();
} else {
  console.error(`Unknown command: ${command}`);
  process.exitCode = 1;
}
