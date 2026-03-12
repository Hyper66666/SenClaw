import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import {
  calculateNextRun,
  isValidTimeZone,
  validateCronExpression,
} from "../src/cron-evaluator.js";

const testsDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testsDir, "../../..");
const cronEvaluatorModuleUrl = pathToFileURL(
  resolve(testsDir, "../src/cron-evaluator.ts"),
).href;
const tsxCliPath = resolve(repoRoot, "node_modules/tsx/dist/cli.mjs");

describe("cron-evaluator", () => {
  describe("validateCronExpression", () => {
    it("validates correct cron expressions", () => {
      expect(validateCronExpression("* * * * *")).toBe(true);
      expect(validateCronExpression("0 9 * * *")).toBe(true);
      expect(validateCronExpression("*/5 * * * *")).toBe(true);
      expect(validateCronExpression("0 0 1 * *")).toBe(true);
    });

    it("rejects invalid cron expressions", () => {
      expect(validateCronExpression("invalid")).toBe(false);
      expect(validateCronExpression("60 * * * *")).toBe(false);
      expect(validateCronExpression("not a cron")).toBe(false);
    });

    it("accepts supported cron aliases", () => {
      for (const expression of [
        "@hourly",
        "@daily",
        "@weekly",
        "@monthly",
        "@yearly",
      ]) {
        expect(validateCronExpression(expression)).toBe(true);
      }
    });
  });

  describe("isValidTimeZone", () => {
    it("accepts standard IANA timezones", () => {
      expect(isValidTimeZone("UTC")).toBe(true);
      expect(isValidTimeZone("America/New_York")).toBe(true);
      expect(isValidTimeZone("Europe/London")).toBe(true);
      expect(isValidTimeZone("Asia/Tokyo")).toBe(true);
      expect(isValidTimeZone("Asia/Shanghai")).toBe(true);
    });

    it("rejects invalid timezone identifiers", () => {
      expect(isValidTimeZone("Mars/Olympus")).toBe(false);
      expect(isValidTimeZone("not-a-timezone")).toBe(false);
    });
  });

  describe("calculateNextRun", () => {
    it("loads under the tsx ESM runtime used by dev servers", () => {
      const script = [
        `import { calculateNextRun } from ${JSON.stringify(cronEvaluatorModuleUrl)};`,
        'console.log(calculateNextRun("* * * * *", "UTC"));',
      ].join("\n");
      const result = spawnSync(process.execPath, [tsxCliPath, "-e", script], {
        cwd: repoRoot,
        encoding: "utf8",
      });

      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout.trim()).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it("calculates next run times across supported timezones", () => {
      const timezones = [
        "UTC",
        "America/New_York",
        "Europe/London",
        "Asia/Tokyo",
      ];

      for (const timezone of timezones) {
        const nextRun = calculateNextRun("0 9 * * *", timezone);
        const nextRunDate = new Date(nextRun);

        expect(Number.isNaN(nextRunDate.getTime())).toBe(false);
        expect(nextRunDate.getTime()).toBeGreaterThan(Date.now());
      }
    });

    it("calculates next run time for every minute", () => {
      const nextRun = calculateNextRun("* * * * *", "UTC");
      const nextRunDate = new Date(nextRun);
      const now = new Date();

      expect(nextRunDate.getTime()).toBeGreaterThan(now.getTime());
      expect(nextRunDate.getTime() - now.getTime()).toBeLessThan(120000);
    });

    it("calculates next run time for daily at 9am", () => {
      const nextRun = calculateNextRun("0 9 * * *", "UTC");
      const nextRunDate = new Date(nextRun);

      expect(nextRunDate.getUTCHours()).toBe(9);
      expect(nextRunDate.getUTCMinutes()).toBe(0);
    });

    it("throws error for invalid cron expression", () => {
      expect(() => calculateNextRun("invalid", "UTC")).toThrow(
        "Invalid cron expression",
      );
    });
  });
});
