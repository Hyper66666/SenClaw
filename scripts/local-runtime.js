import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
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
import {
  LOCAL_RUNTIME_AGENT_NAME,
  createDefaultLocalRuntimeAgent,
  createStartupBanner,
  createWebRuntimeProcessSpec,
  loadConfig,
  loadProviderSmokeConfig,
  readRuntimeSettings,
  resolveLocalRuntimeFiles,
  writeRuntimeSettings,
} from "../packages/config/dist/index.js";
import {
  computeApiKeyLookupHash,
  createStorage,
  deserializeTools,
  generateApiKey,
  hashApiKey,
  openDatabase,
  runMigrations,
  serializeProvider,
  serializeTools,
} from "../packages/storage/dist/index.js";
const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const runtimeFiles = resolveLocalRuntimeFiles(workspaceRoot);
const corepackCommand =
  process.platform === "win32" ? "corepack.cmd" : "corepack";
const ADMIN_API_HASH_PARAM = "gatewayApiKey";
function getGatewayPort() {
  return process.env.SENCLAW_GATEWAY_PORT ?? "4100";
}
function getWebPort() {
  return process.env.SENCLAW_WEB_PORT ?? "3000";
}
function getGatewayUrl() {
  return `http://localhost:${getGatewayPort()}`;
}
function getWebUrl() {
  return `http://localhost:${getWebPort()}`;
}
function readPidFile(filePath) {
  if (!existsSync(filePath)) {
    return undefined;
  }
  const raw = readFileSync(filePath, "utf8").trim();
  const pid = Number.parseInt(raw, 10);
  return Number.isFinite(pid) ? pid : undefined;
}
function isProcessAlive(pid) {
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
async function isHttpReachable(url) {
  try {
    const response = await fetch(url);
    return response.ok || response.status < 500;
  } catch {
    return false;
  }
}
async function waitForUrl(url, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isHttpReachable(url)) {
      return;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
  }
  throw new Error(`Timed out waiting for ${url}`);
}
async function fetchPendingApprovals(gatewayUrl, adminKey) {
  try {
    const response = await fetch(`${gatewayUrl}/api/runtime/approvals`, {
      headers: {
        authorization: `Bearer ${adminKey}`,
      },
    });
    if (!response.ok) {
      return [];
    }
    const payload = await response.json();
    return Array.isArray(payload) ? payload : [];
  } catch {
    return [];
  }
}
function buildWorkspace() {
  const result = spawnSync(corepackCommand, ["pnpm", "run", "build"], {
    cwd: workspaceRoot,
    stdio: "inherit",
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error("Build failed. See output above.");
  }
}
async function ensureAdminKey(dbUrl) {
  mkdirSync(runtimeFiles.runtimeDir, { recursive: true });
  if (existsSync(runtimeFiles.adminKeyFile)) {
    return readFileSync(runtimeFiles.adminKeyFile, "utf8").trim();
  }
  const storage = createStorage(dbUrl);
  try {
    const rawKey = generateApiKey();
    await storage.apiKeys.create({
      id: randomUUID(),
      lookupHash: computeApiKeyLookupHash(rawKey),
      keyHash: await hashApiKey(rawKey),
      name:
        (await storage.apiKeys.count()) === 0
          ? "Bootstrap Admin Key"
          : "Local Runtime Admin Key",
      role: "admin",
      createdBy: "system",
      createdAt: new Date().toISOString(),
      expiresAt: null,
      lastUsedAt: null,
      revokedAt: null,
      revokedBy: null,
      revokedReason: null,
    });
    writeFileSync(runtimeFiles.adminKeyFile, `${rawKey}\n`, "utf8");
    return rawKey;
  } finally {
    storage.close();
  }
}
function syncLocalRuntimeAgent(dbUrl, model) {
  const db = openDatabase(dbUrl);
  runMigrations(db);
  try {
    const existing = db.$client
      .prepare(
        "select id, system_prompt as systemPrompt, provider, tools from agents where name = ?",
      )
      .get(LOCAL_RUNTIME_AGENT_NAME);
    const desired = createDefaultLocalRuntimeAgent(
      {
        provider: "openai",
        model,
      },
      existing
        ? {
            systemPrompt: existing.systemPrompt,
            tools: deserializeTools(existing.tools),
          }
        : undefined,
    );
    const serializedProvider = serializeProvider(desired.provider);
    const serializedTools = serializeTools(desired.tools ?? []);
    if (!existing) {
      db.$client
        .prepare(
          "insert into agents (id, name, system_prompt, provider, tools) values (?, ?, ?, ?, ?)",
        )
        .run(
          randomUUID(),
          desired.name,
          desired.systemPrompt,
          serializedProvider,
          serializedTools,
        );
      return;
    }
    if (
      existing.systemPrompt === desired.systemPrompt &&
      existing.provider === serializedProvider &&
      existing.tools === serializedTools
    ) {
      return;
    }
    db.$client
      .prepare(
        "update agents set system_prompt = ?, provider = ?, tools = ? where id = ?",
      )
      .run(
        desired.systemPrompt,
        serializedProvider,
        serializedTools,
        existing.id,
      );
  } finally {
    db.$client.close();
  }
}
function spawnBackgroundProcess(
  command,
  args,
  logFile,
  errorFile,
  env,
  cwd = workspaceRoot,
) {
  const stdout = openSync(logFile, "a");
  const stderr = openSync(errorFile, "a");
  const child = spawn(command, args, {
    cwd,
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
async function ensureNoUntrackedCollision(service) {
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
async function start() {
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
  syncLocalRuntimeAgent(dbUrl, provider.model);
  const autoLoginUrl = new URL(
    `/#${ADMIN_API_HASH_PARAM}=${encodeURIComponent(adminKey)}`,
    `${webUrl}/`,
  ).toString();
  const webProcessSpec = createWebRuntimeProcessSpec(workspaceRoot, webPort);
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
        webProcessSpec.command,
        webProcessSpec.args,
        runtimeFiles.webOutLog,
        runtimeFiles.webErrLog,
        env,
        webProcessSpec.cwd,
      )
    : reusedWebPid;
  writeFileSync(runtimeFiles.webPidFile, `${webPid}\n`, "utf8");
  await waitForUrl(`${gatewayUrl}/health`);
  await waitForUrl(webUrl);
  const pendingApprovals = await fetchPendingApprovals(gatewayUrl, adminKey);
  console.log(
    createStartupBanner({
      locale: settings.locale,
      model: provider.model,
      adminKey,
      gatewayUrl,
      webUrl,
      autoLoginUrl,
      logDir: runtimeFiles.runtimeDir,
      pendingApprovals,
    }),
  );
}
function stopTrackedProcess(pidFile) {
  const pid = readPidFile(pidFile);
  if (!pid || !isProcessAlive(pid)) {
    if (existsSync(pidFile)) {
      unlinkSync(pidFile);
    }
    return;
  }
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
      stdio: "ignore",
    });
  } else {
    process.kill(pid);
  }
  if (existsSync(pidFile)) {
    unlinkSync(pidFile);
  }
}
function stop() {
  const locale = readRuntimeSettings(runtimeFiles.settingsFile).locale;
  stopTrackedProcess(runtimeFiles.webPidFile);
  stopTrackedProcess(runtimeFiles.gatewayPidFile);
  if (locale === "zh-CN") {
    console.log("SenClaw \u5df2\u505c\u6b62\u3002");
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
