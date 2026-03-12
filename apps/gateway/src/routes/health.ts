import type { HealthCheck } from "@senclaw/observability";
import type { FastifyInstance } from "fastify";

export async function healthRoutes(
  app: FastifyInstance,
  opts: { checks: Record<string, HealthCheck> },
): Promise<void> {
  const { checks } = opts;

  app.get(
    "/",
    {
      config: {
        rateLimit: false,
      },
    },
    async (_request, reply) => {
      const results: Record<string, unknown> = {};
      let overallStatus: "healthy" | "degraded" | "unhealthy" = "healthy";

      for (const [name, check] of Object.entries(checks)) {
        const result = await check.check();
        results[name] = result;
        if (result.status === "unhealthy") overallStatus = "unhealthy";
        else if (result.status === "degraded" && overallStatus === "healthy") {
          overallStatus = "degraded";
        }
      }

      const statusCode = overallStatus === "unhealthy" ? 503 : 200;
      reply.status(statusCode).send({
        status: overallStatus,
        details: Object.keys(results).length > 0 ? results : undefined,
      });
    },
  );
}
