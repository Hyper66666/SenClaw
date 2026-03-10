import { performance } from "node:perf_hooks";
import { getMetricsRegistry } from "@senclaw/observability";

export function observeDbQuery<T>(operation: string, query: () => T): T {
  const startedAt = performance.now();

  try {
    return query();
  } finally {
    getMetricsRegistry().recordDatabaseQuery({
      operation,
      durationSeconds: Math.max(0, performance.now() - startedAt) / 1000,
    });
  }
}
