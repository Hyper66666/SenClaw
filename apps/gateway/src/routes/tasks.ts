import type { AgentService } from "@senclaw/agent-runner";
import { TaskSchema } from "@senclaw/protocol";
import type { FastifyInstance } from "fastify";
import { requireRoles, writeRoles } from "../auth/authorization.js";

export async function taskRoutes(
  app: FastifyInstance,
  opts: { agentService: AgentService },
): Promise<void> {
  const { agentService } = opts;

  app.post(
    "/",
    { preHandler: requireRoles(...writeRoles) },
    async (request, reply) => {
      const parsed = TaskSchema.safeParse(request.body);
      if (!parsed.success) {
        reply.status(400).send({
          error: "VALIDATION_ERROR",
          message: "Invalid task submission",
          details: parsed.error.issues.map((i) => ({
            path: i.path.join("."),
            message: i.message,
          })),
        });
        return;
      }

      try {
        const run = await agentService.submitTask(
          parsed.data.agentId,
          parsed.data.input,
        );
        reply.status(201).send(run);
      } catch (error) {
        if (error instanceof Error && error.message.includes("not found")) {
          reply.status(404).send({
            error: "NOT_FOUND",
            message: error.message,
          });
          return;
        }
        throw error;
      }
    },
  );
}
