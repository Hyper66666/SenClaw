import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONSOLE_LOCALE,
  createStartupBanner,
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

  it("renders an English startup banner by default", () => {
    const banner = createStartupBanner({
      locale: DEFAULT_CONSOLE_LOCALE,
      model: "doubao-seed-2.0-pro",
      adminKey: "sk_test",
      gatewayUrl: "http://localhost:4100",
      webUrl: "http://localhost:3000",
      logDir: "D:/senclaw/.tmp/live-run",
    });

    expect(banner).toContain("SenClaw is ready");
    expect(banner).toContain("Model ID: doubao-seed-2.0-pro");
    expect(banner).toContain("Admin Key: sk_test");
    expect(banner).toContain("Web Console: http://localhost:3000");
  });

  it("renders a Chinese startup banner when the locale is zh-CN", () => {
    const banner = createStartupBanner({
      locale: "zh-CN",
      model: "doubao-seed-2.0-pro",
      adminKey: "sk_test",
      gatewayUrl: "http://localhost:4100",
      webUrl: "http://localhost:3000",
      logDir: "D:/senclaw/.tmp/live-run",
    });

    expect(banner).toContain("SenClaw \u5df2\u542f\u52a8");
    expect(banner).toContain("\u6a21\u578b ID: doubao-seed-2.0-pro");
    expect(banner).toContain("\u7ba1\u7406\u5bc6\u94a5: sk_test");
    expect(banner).toContain("Web \u63a7\u5236\u53f0: http://localhost:3000");
  });
});
