import {
  CreateScheduledJobSchema,
  UpdateScheduledJobSchema,
} from "@senclaw/protocol";
import {
  type SchedulerService,
  isValidTimeZone,
  validateCronExpression,
} from "@senclaw/scheduler";
import type { FastifyInstance } from "fastify";
import { readRoles, requireRoles, writeRoles } from "../auth/authorization.js";

function validateScheduleFields(input: {
  cronExpression?: string;
  timezone?: string;
}): Array<{ path: string; message: string }> {
  const issues: Array<{ path: string; message: string }> = [];

  if (
    input.cronExpression !== undefined &&
    !validateCronExpression(input.cronExpression)
  ) {
    issues.push({
      path: "cronExpression",
      message: "Invalid cron expression",
    });
  }

  if (input.timezone !== undefined && !isValidTimeZone(input.timezone)) {
    issues.push({
      path: "timezone",
      message: "Invalid timezone",
    });
  }

  return issues;
}

export async function jobRoutes(
  app: FastifyInstance,
  opts: { schedulerService: SchedulerService },
): Promise<void> {
  const { schedulerService } = opts;

  app.post(
    "/",
    { preHandler: requireRoles(...writeRoles) },
    async (request, reply) => {
      const parsed = CreateScheduledJobSchema.safeParse(request.body);
      if (!parsed.success) {
        reply.status(400).send({
          error: "VALIDATION_ERROR",
          message: "Invalid job definition",
          details: parsed.error.issues.map((i) => ({
            path: i.path.join("."),
            message: i.message,
          })),
        });
        return;
      }

      const issues = validateScheduleFields(parsed.data);
      if (issues.length > 0) {
        reply.status(400).send({
          error: "VALIDATION_ERROR",
          message: "Invalid job definition",
          details: issues,
        });
        return;
      }

      try {
        const job = await schedulerService.createJob(parsed.data);
        reply.status(201).send(job);
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

  app.get("/", { preHandler: requireRoles(...readRoles) }, async (request) => {
    const { agentId, enabled } = request.query as {
      agentId?: string;
      enabled?: string;
    };
    const filters: { agentId?: string; enabled?: boolean } = {};
    if (agentId) filters.agentId = agentId;
    if (enabled !== undefined) filters.enabled = enabled === "true";

    return schedulerService.listJobs(filters);
  });

  app.get<{ Params: { id: string } }>(
    "/:id",
    { preHandler: requireRoles(...readRoles) },
    async (request, reply) => {
      const job = await schedulerService.getJob(request.params.id);
      if (!job) {
        reply.status(404).send({
          error: "NOT_FOUND",
          message: `Job "${request.params.id}" not found`,
        });
        return;
      }
      return job;
    },
  );

  app.patch<{ Params: { id: string } }>(
    "/:id",
    { preHandler: requireRoles(...writeRoles) },
    async (request, reply) => {
      const parsed = UpdateScheduledJobSchema.safeParse(request.body);
      if (!parsed.success) {
        reply.status(400).send({
          error: "VALIDATION_ERROR",
          message: "Invalid job update",
          details: parsed.error.issues.map((i) => ({
            path: i.path.join("."),
            message: i.message,
          })),
        });
        return;
      }

      const issues = validateScheduleFields(parsed.data);
      if (issues.length > 0) {
        reply.status(400).send({
          error: "VALIDATION_ERROR",
          message: "Invalid job update",
          details: issues,
        });
        return;
      }

      const job = await schedulerService.updateJob(
        request.params.id,
        parsed.data,
      );
      if (!job) {
        reply.status(404).send({
          error: "NOT_FOUND",
          message: `Job "${request.params.id}" not found`,
        });
        return;
      }
      return job;
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/:id",
    { preHandler: requireRoles(...writeRoles) },
    async (request, reply) => {
      const deleted = await schedulerService.deleteJob(request.params.id);
      if (!deleted) {
        reply.status(404).send({
          error: "NOT_FOUND",
          message: `Job "${request.params.id}" not found`,
        });
        return;
      }
      reply.status(204).send();
    },
  );

  app.get<{ Params: { id: string } }>(
    "/:id/executions",
    { preHandler: requireRoles(...readRoles) },
    async (request) => {
      const { limit, offset } = request.query as {
        limit?: string;
        offset?: string;
      };
      const executions = await schedulerService.getJobExecutions(
        request.params.id,
        limit ? Number.parseInt(limit, 10) : undefined,
        offset ? Number.parseInt(offset, 10) : undefined,
      );
      return executions;
    },
  );
}
