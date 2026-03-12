import type { AgentService } from "@senclaw/agent-runner";
import { CreateAgentSchema } from "@senclaw/protocol";
import type { FastifyInstance } from "fastify";
import { readRoles, requireRoles, writeRoles } from "../auth/authorization.js";

export async function agentRoutes(
  app: FastifyInstance,
  opts: { agentService: AgentService },
): Promise<void> {
  const { agentService } = opts;

  app.post(
    "/",
    { preHandler: requireRoles(...writeRoles) },
    async (request, reply) => {
      const parsed = CreateAgentSchema.safeParse(request.body);
      if (!parsed.success) {
        reply.status(400).send({
          error: "VALIDATION_ERROR",
          message: "Invalid agent definition",
          details: parsed.error.issues.map((i) => ({
            path: i.path.join("."),
            message: i.message,
          })),
        });
        return;
      }

      const agent = await agentService.createAgent(parsed.data);
      reply.status(201).send(agent);
    },
  );

  app.get("/", { preHandler: requireRoles(...readRoles) }, async () => {
    return agentService.listAgents();
  });

  app.get<{ Params: { id: string } }>(
    "/:id",
    { preHandler: requireRoles(...readRoles) },
    async (request, reply) => {
      const agent = await agentService.getAgent(request.params.id);
      if (!agent) {
        reply.status(404).send({
          error: "NOT_FOUND",
          message: `Agent \"${request.params.id}\" not found`,
        });
        return;
      }
      return agent;
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/:id",
    { preHandler: requireRoles(...writeRoles) },
    async (request, reply) => {
      const deleted = await agentService.deleteAgent(request.params.id);
      if (!deleted) {
        reply.status(404).send({
          error: "NOT_FOUND",
          message: `Agent \"${request.params.id}\" not found`,
        });
        return;
      }
      reply.status(204).send();
    },
  );
}
