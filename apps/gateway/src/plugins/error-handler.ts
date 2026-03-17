import type { FastifyError } from "fastify";
import fp from "fastify-plugin";
import { ZodError } from "zod/v4";

export const errorHandlerPlugin = fp(async (app) => {
  app.setErrorHandler((error: FastifyError | Error, _request, reply) => {
    if (error instanceof ZodError) {
      const details = error.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
      }));
      reply.status(400).send({
        error: "VALIDATION_ERROR",
        message: "Request validation failed",
        details,
      });
      return;
    }

    const statusCode =
      "statusCode" in error ? ((error as FastifyError).statusCode ?? 500) : 500;

    if (statusCode === 400) {
      reply.status(400).send({
        error: "INVALID_JSON",
        message: error.message,
      });
      return;
    }

    if (statusCode === 404) {
      reply.status(404).send({
        error: "NOT_FOUND",
        message: error.message,
      });
      return;
    }

    if (statusCode === 429) {
      reply.status(429).send({
        error: "RATE_LIMIT_EXCEEDED",
        message: error.message,
        retryAfter: Number(reply.getHeader("retry-after") ?? 0) || undefined,
      });
      return;
    }

    return reply.status(statusCode).send({
      error: "INTERNAL_ERROR",
      message: statusCode >= 500 ? "Internal server error" : error.message,
    });
  });
});
