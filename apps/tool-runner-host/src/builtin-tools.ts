import { z } from "zod/v4";
import type { ToolRegistry } from "./registry.js";

const EchoInputSchema = z.object({
  message: z.string(),
});

export function registerBuiltinTools(registry: ToolRegistry): void {
  registry.register(
    {
      name: "echo",
      description: "Returns the input message as-is. Useful for testing.",
      inputSchema: EchoInputSchema,
    },
    (args) => args.message,
  );
}
