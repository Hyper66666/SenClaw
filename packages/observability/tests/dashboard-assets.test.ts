import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const dashboardFiles = [
  {
    path: resolve("ops/observability/grafana/system-overview.json"),
    title: "Senclaw - System Overview",
  },
  {
    path: resolve("ops/observability/grafana/agent-performance.json"),
    title: "Senclaw - Agent Performance",
  },
  {
    path: resolve("ops/observability/grafana/tool-analytics.json"),
    title: "Senclaw - Tool Analytics",
  },
];

describe("Grafana dashboard assets", () => {
  it.each(dashboardFiles)(
    "parses $path and exposes the expected title",
    ({ path, title }) => {
      const parsed = JSON.parse(readFileSync(path, "utf8")) as {
        title?: string;
        panels?: unknown[];
      };

      expect(parsed.title).toBe(title);
      expect(Array.isArray(parsed.panels)).toBe(true);
      expect(parsed.panels?.length).toBeGreaterThan(0);
    },
  );
});
