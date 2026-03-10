import type { AuthenticatedApiKey } from "@senclaw/protocol";

declare module "fastify" {
  interface FastifyRequest {
    apiKey?: AuthenticatedApiKey;
  }
}
