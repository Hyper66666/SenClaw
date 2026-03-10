import type { HealthCheck, HealthCheckResult } from "@senclaw/observability";

export class DatabaseHealthCheck implements HealthCheck {
  constructor(private readonly runQuery: () => unknown) {}

  async check(): Promise<HealthCheckResult> {
    try {
      await Promise.resolve(this.runQuery());
      return { status: "healthy" };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return { status: "unhealthy", detail };
    }
  }
}
