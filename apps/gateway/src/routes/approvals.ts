import type { FastifyInstance } from "fastify";
import { z } from "zod/v4";
import { requireRoles } from "../auth/authorization.js";
import type { ApprovalQueue } from "../approval-queue.js";

const RejectApprovalBodySchema = z.object({
  comment: z.string().trim().min(1).optional(),
});

export async function approvalRoutes(
  app: FastifyInstance,
  opts: { approvalQueue: ApprovalQueue },
): Promise<void> {
  const { approvalQueue } = opts;

  app.get("/", { preHandler: requireRoles("admin") }, async () => {
    return approvalQueue.list();
  });

  app.post<{ Params: { id: string } }>(
    "/:id/approve",
    { preHandler: requireRoles("admin") },
    async (request, reply) => {
      const requester = request.apiKey;
      if (!requester) {
        reply.status(401).send({
          error: "UNAUTHORIZED",
          message: "API key required",
        });
        return;
      }

      const approved = approvalQueue.approve(request.params.id, requester.id);
      if (!approved) {
        reply.status(404).send({
          error: "NOT_FOUND",
          message: `Approval request \"${request.params.id}\" not found`,
        });
        return;
      }

      return approved;
    },
  );

  app.post<{ Params: { id: string } }>(
    "/:id/reject",
    { preHandler: requireRoles("admin") },
    async (request, reply) => {
      const requester = request.apiKey;
      if (!requester) {
        reply.status(401).send({
          error: "UNAUTHORIZED",
          message: "API key required",
        });
        return;
      }

      const parsed = RejectApprovalBodySchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        reply.status(400).send({
          error: "VALIDATION_ERROR",
          message: "Invalid approval rejection request",
          details: parsed.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        });
        return;
      }

      const rejected = approvalQueue.reject(
        request.params.id,
        requester.id,
        parsed.data.comment,
      );
      if (!rejected) {
        reply.status(404).send({
          error: "NOT_FOUND",
          message: `Approval request \"${request.params.id}\" not found`,
        });
        return;
      }

      return rejected;
    },
  );
}
