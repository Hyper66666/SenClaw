import type { AgentService } from "@senclaw/agent-runner";
import type { FastifyInstance } from "fastify";
import { readRoles, requireRoles } from "../auth/authorization.js";

export async function runRoutes(
  app: FastifyInstance,
  opts: { agentService: AgentService },
): Promise<void> {
  const { agentService } = opts;

  app.get<{ Params: { id: string } }>(
    "/:id",
    { preHandler: requireRoles(...readRoles) },
    async (request, reply) => {
      const run = await agentService.getRun(request.params.id);
      if (!run) {
        reply.status(404).send({
          error: "NOT_FOUND",
          message: `Run \"${request.params.id}\" not found`,
        });
        return;
      }
      return run;
    },
  );

  app.get<{ Params: { id: string } }>(
    "/:id/messages",
    { preHandler: requireRoles(...readRoles) },
    async (request, reply) => {
      const run = await agentService.getRun(request.params.id);
      if (!run) {
        reply.status(404).send({
          error: "NOT_FOUND",
          message: `Run \"${request.params.id}\" not found`,
        });
        return;
      }
      return agentService.getRunMessages(request.params.id);
    },
  );
}
