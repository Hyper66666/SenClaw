import type { AgentService } from "@senclaw/agent-runner";
import { z } from "zod/v4";
import type { FastifyInstance } from "fastify";
import { readRoles, requireRoles, writeRoles } from "../auth/authorization.js";

const CreateBackgroundAgentTaskSchema = z.object({
  agentId: z.string().min(1),
  input: z.string().min(1),
  parentRunId: z.string().min(1).optional(),
  parentTaskId: z.string().min(1).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const AgentTaskMessageSchema = z.object({
  content: z.string().min(1),
  role: z.enum(["user", "system"]).default("user"),
});

export async function agentTaskRoutes(
  app: FastifyInstance,
  opts: { agentService: AgentService },
): Promise<void> {
  const { agentService } = opts;

  app.post(
    "/background",
    { preHandler: requireRoles(...writeRoles) },
    async (request, reply) => {
      const parsed = CreateBackgroundAgentTaskSchema.safeParse(request.body);
      if (!parsed.success) {
        reply.status(400).send({
          error: "VALIDATION_ERROR",
          message: "Invalid background agent task request",
          details: parsed.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        });
        return;
      }

      try {
        const task = await agentService.createBackgroundTask(
          parsed.data.agentId,
          parsed.data.input,
          {
            parentRunId: parsed.data.parentRunId,
            parentTaskId: parsed.data.parentTaskId,
            metadata: parsed.data.metadata,
          },
        );
        reply.status(201).send(task);
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

  app.get("/", { preHandler: requireRoles(...readRoles) }, async () => {
    return agentService.listAgentTasks();
  });

  app.get<{ Params: { id: string } }>(
    "/:id",
    { preHandler: requireRoles(...readRoles) },
    async (request, reply) => {
      const task = await agentService.getAgentTask(request.params.id);
      if (!task) {
        reply.status(404).send({
          error: "NOT_FOUND",
          message: `Agent task \"${request.params.id}\" not found`,
        });
        return;
      }
      return task;
    },
  );

  app.get<{ Params: { id: string } }>(
    "/:id/messages",
    { preHandler: requireRoles(...readRoles) },
    async (request, reply) => {
      const task = await agentService.getAgentTask(request.params.id);
      if (!task) {
        reply.status(404).send({
          error: "NOT_FOUND",
          message: `Agent task \"${request.params.id}\" not found`,
        });
        return;
      }
      return agentService.getAgentTaskMessages(request.params.id);
    },
  );

  app.post<{ Params: { id: string } }>(
    "/:id/messages",
    { preHandler: requireRoles(...writeRoles) },
    async (request, reply) => {
      const parsed = AgentTaskMessageSchema.safeParse(request.body);
      if (!parsed.success) {
        reply.status(400).send({
          error: "VALIDATION_ERROR",
          message: "Invalid agent task message",
          details: parsed.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        });
        return;
      }

      try {
        const pending = await agentService.sendMessageToAgentTask(
          request.params.id,
          parsed.data.content,
          parsed.data.role,
        );
        reply.status(202).send(pending);
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

  app.post<{ Params: { id: string } }>(
    "/:id/resume",
    { preHandler: requireRoles(...writeRoles) },
    async (request, reply) => {
      try {
        const task = await agentService.resumeAgentTask(request.params.id);
        reply.status(202).send(task);
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
