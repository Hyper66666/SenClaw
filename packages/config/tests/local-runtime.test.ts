import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONSOLE_LOCALE,
  LOCAL_RUNTIME_AGENT_NAME,
  LOCAL_RUNTIME_AGENT_TOOLS,
  createDefaultLocalRuntimeAgent,
  createStartupBanner,
  createWebRuntimeProcessSpec,
  resolveLocalRuntimeFiles,
} from "../src/local-runtime.js";

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/");
}

describe("local runtime helpers", () => {
  it("resolves the default runtime file layout", () => {
    const files = resolveLocalRuntimeFiles("D:/senclaw");

    expect(normalizePath(files.runtimeDir)).toBe("D:/senclaw/.tmp/live-run");
    expect(normalizePath(files.settingsFile)).toBe(
      "D:/senclaw/.tmp/live-run/runtime-settings.json",
    );
    expect(normalizePath(files.adminKeyFile)).toBe(
      "D:/senclaw/.tmp/live-run/admin-key.txt",
    );
    expect(normalizePath(files.gatewayPidFile)).toBe(
      "D:/senclaw/.tmp/live-run/gateway.pid",
    );
    expect(normalizePath(files.webPidFile)).toBe(
      "D:/senclaw/.tmp/live-run/web.pid",
    );
  });

  it("creates a direct vite process spec for the local web runtime", () => {
    const spec = createWebRuntimeProcessSpec("D:/senclaw", "3000");

    expect(spec.command).toBe(process.execPath);
    expect(normalizePath(spec.cwd)).toBe("D:/senclaw/apps/web");
    expect(normalizePath(spec.args[0])).toContain("/vite/bin/vite.js");
    expect(existsSync(spec.args[0])).toBe(true);
    expect(spec.args.slice(1)).toEqual([
      "--host",
      "127.0.0.1",
      "--port",
      "3000",
    ]);
  });

  it("defines the default local runtime agent with filesystem and shell tools", () => {
    expect(LOCAL_RUNTIME_AGENT_NAME).toBe("SenClaw Assistant");
    expect(LOCAL_RUNTIME_AGENT_TOOLS).toEqual([
      "echo",
      "fs.read_text",
      "fs.read_dir",
      "fs.write_text",
      "shell.exec",
    ]);

    expect(
      createDefaultLocalRuntimeAgent({
        provider: "openai",
        model: "doubao-seed-2.0-pro",
      }),
    ).toMatchObject({
      name: "SenClaw Assistant",
      provider: {
        provider: "openai",
        model: "doubao-seed-2.0-pro",
      },
      tools: [
        "echo",
        "fs.read_text",
        "fs.read_dir",
        "fs.write_text",
        "shell.exec",
      ],
    });
  });

  it("renders an English startup banner by default", () => {
    const banner = createStartupBanner({
      locale: DEFAULT_CONSOLE_LOCALE,
      model: "doubao-seed-2.0-pro",
      adminKey: "sk_test",
      gatewayUrl: "http://localhost:4100",
      webUrl: "http://localhost:3000",
      autoLoginUrl: "http://localhost:3000/#gatewayApiKey=sk_test",
      logDir: "D:/senclaw/.tmp/live-run",
    });

    expect(banner).toContain("SenClaw is ready");
    expect(banner).toContain("Model ID: doubao-seed-2.0-pro");
    expect(banner).toContain("Admin Key: sk_test");
    expect(banner).toContain("Web Console: http://localhost:3000");
    expect(banner).toContain(
      "Admin API: http://localhost:3000/#gatewayApiKey=sk_test",
    );
  });

  it("renders pending approval instructions when approvals exist", () => {
    const banner = createStartupBanner({
      locale: DEFAULT_CONSOLE_LOCALE,
      model: "doubao-seed-2.0-pro",
      adminKey: "sk_test",
      gatewayUrl: "http://localhost:4100",
      webUrl: "http://localhost:3000",
      autoLoginUrl: "http://localhost:3000/#gatewayApiKey=sk_test",
      logDir: "D:/senclaw/.tmp/live-run",
      pendingApprovals: [
        {
          id: "approval-1",
          kind: "shell",
          action: "execute",
          targetPaths: ["C:\\Windows\\System32"],
          reason: "The requested action requires elevated local permissions.",
          requestedBy: "tool:shell.exec",
        },
      ],
    });

    expect(banner).toContain("Pending approvals:");
    expect(banner).toContain("approval-1");
    expect(banner).toContain(
      "Approve: POST /api/runtime/approvals/approval-1/approve",
    );
    expect(banner).toContain(
      "Reject: POST /api/runtime/approvals/approval-1/reject",
    );
  });

  it("renders a Chinese startup banner when the locale is zh-CN", () => {
    const banner = createStartupBanner({
      locale: "zh-CN",
      model: "doubao-seed-2.0-pro",
      adminKey: "sk_test",
      gatewayUrl: "http://localhost:4100",
      webUrl: "http://localhost:3000",
      autoLoginUrl: "http://localhost:3000/#gatewayApiKey=sk_test",
      logDir: "D:/senclaw/.tmp/live-run",
    });

    expect(banner).toContain("SenClaw \u5df2\u542f\u52a8");
    expect(banner).toContain("\u6a21\u578b ID: doubao-seed-2.0-pro");
    expect(banner).toContain("\u7ba1\u7406\u5bc6\u94a5: sk_test");
    expect(banner).toContain("Web \u63a7\u5236\u53f0: http://localhost:3000");
    expect(banner).toContain(
      "Admin API: http://localhost:3000/#gatewayApiKey=sk_test",
    );
  });
});
