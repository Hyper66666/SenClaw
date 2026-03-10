import fp from "fastify-plugin";
import { generateCorrelationId, withCorrelationId } from "@senclaw/logging";

export const correlationIdPlugin = fp(async (app) => {
  app.addHook("onRequest", (request, reply, done) => {
    const id =
      (request.headers["x-correlation-id"] as string | undefined) ??
      generateCorrelationId();
    void reply.header("x-correlation-id", id);
    withCorrelationId(id, done);
  });
});
