import { ConsoleLocaleSchema } from "@senclaw/config";
import type { FastifyInstance } from "fastify";
import type { RuntimeSettingsStore } from "../runtime-settings.js";

export async function runtimeSettingsRoutes(
  app: FastifyInstance,
  opts: { store: RuntimeSettingsStore },
): Promise<void> {
  const { store } = opts;

  app.get("/", async () => {
    return store.get();
  });

  app.put("/", async (request, reply) => {
    const body = request.body as Record<string, unknown> | undefined;
    const parsed = ConsoleLocaleSchema.safeParse(body?.locale);
    if (!parsed.success) {
      reply.status(400).send({
        error: "VALIDATION_ERROR",
        message: "Invalid runtime settings",
        details: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      });
      return;
    }

    return store.update({ locale: parsed.data });
  });
}
