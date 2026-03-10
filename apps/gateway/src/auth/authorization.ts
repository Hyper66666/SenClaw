import type { ApiKeyRole } from "@senclaw/protocol";
import type { preHandlerHookHandler } from "fastify";

export const readRoles: ApiKeyRole[] = ["admin", "user", "readonly"];
export const writeRoles: ApiKeyRole[] = ["admin", "user"];

export function requireRoles(
  ...allowedRoles: ApiKeyRole[]
): preHandlerHookHandler {
  return async (request, reply) => {
    if (!request.apiKey) {
      reply.status(401).send({
        error: "UNAUTHORIZED",
        message: "API key required",
      });
      return;
    }

    if (!allowedRoles.includes(request.apiKey.role)) {
      reply.status(403).send({
        error: "FORBIDDEN",
        message: `Insufficient permissions. Required role: ${allowedRoles.join(
          " or ",
        )}. Your role: ${request.apiKey.role}`,
      });
    }
  };
}
