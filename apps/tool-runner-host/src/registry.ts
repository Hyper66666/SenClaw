import { performance } from "node:perf_hooks";
import { createChildLogger, createLogger } from "@senclaw/logging";
import {
  getMetricsRegistry,
  setSpanError,
  setSpanOk,
  withActiveSpan,
} from "@senclaw/observability";
import type { ToolDefinition, ToolResult } from "@senclaw/protocol";
import type { z } from "zod/v4";
import { SandboxedToolRunner } from "./sandbox.js";

export interface ToolHandler<T = unknown> {
  definition: ToolDefinition;
  execute: (args: T) => Promise<string> | string;
}

const logger = createLogger(
  "tool-runner",
  (process.env.SENCLAW_LOG_LEVEL as
    | "trace"
    | "debug"
    | "info"
    | "warn"
    | "error"
    | "fatal"
    | undefined) ?? "info",
);

export class ToolRegistry {
  private tools = new Map<string, ToolHandler>();
  private timeoutMs: number;
  private sandboxRunner: SandboxedToolRunner;

  constructor(
    timeoutMs = 10_000,
    sandboxRunner = new SandboxedToolRunner({ defaultTimeoutMs: timeoutMs }),
  ) {
    this.timeoutMs = timeoutMs;
    this.sandboxRunner = sandboxRunner;
  }

  register<T extends z.ZodType>(
    definition: ToolDefinition<T>,
    handler: (args: z.infer<T>) => Promise<string> | string,
  ): void {
    if (this.tools.has(definition.name)) {
      throw new Error(`Tool "${definition.name}" is already registered`);
    }
    this.tools.set(definition.name, {
      definition,
      execute: handler as (args: unknown) => Promise<string> | string,
    });
  }

  getTool(name: string): ToolHandler | undefined {
    return this.tools.get(name);
  }

  listTools(): ToolDefinition[] {
    return Array.from(this.tools.values()).map((t) => t.definition);
  }

  private async invokeHandler(
    handler: ToolHandler,
    args: unknown,
  ): Promise<string> {
    if ((handler.definition.sandbox?.level ?? 0) >= 1) {
      return this.sandboxRunner.execute(handler, args);
    }

    return Promise.race([
      Promise.resolve(handler.execute(args)),
      new Promise<never>((_resolve, reject) =>
        setTimeout(
          () => reject(new Error("Tool execution timed out")),
          this.timeoutMs,
        ),
      ),
    ]);
  }

  async executeTool(
    toolCallId: string,
    toolName: string,
    args: unknown,
  ): Promise<ToolResult> {
    return withActiveSpan(
      "tool.execute",
      {
        tracerName: "senclaw-tool-runner",
        kind: "internal",
        setOkStatusOnSuccess: false,
        attributes: {
          "tool.name": toolName,
          "tool.call_id": toolCallId,
        },
      },
      async (span) => {
        const startedAt = performance.now();
        const toolLogger = createChildLogger(logger, {
          toolCallId,
          toolName,
        });
        const recordMetric = (status: "success" | "failed") => {
          getMetricsRegistry().recordToolCall({
            toolName,
            status,
            durationSeconds: Math.max(0, performance.now() - startedAt) / 1000,
          });
        };

        const handler = this.tools.get(toolName);
        if (!handler) {
          recordMetric("failed");
          setSpanError(span, `Tool "${toolName}" not found`);
          toolLogger.warn("Tool execution requested for unknown tool");
          return {
            toolCallId,
            success: false,
            error: `Tool "${toolName}" not found`,
          };
        }

        const parseResult = handler.definition.inputSchema.safeParse(args);
        if (!parseResult.success) {
          const issues = (parseResult as { error: z.ZodError }).error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; ");
          recordMetric("failed");
          setSpanError(span, `Validation failed: ${issues}`);
          toolLogger.warn({ validationErrors: issues }, "Tool input rejected");
          return {
            toolCallId,
            success: false,
            error: `Validation failed: ${issues}`,
          };
        }

        try {
          toolLogger.debug(
            { sandboxLevel: handler.definition.sandbox?.level ?? 0 },
            "Tool execution started",
          );
          const result = await this.invokeHandler(handler, parseResult.data);
          recordMetric("success");
          setSpanOk(span);
          toolLogger.info(
            {
              durationMs: Math.max(
                0,
                Math.round(performance.now() - startedAt),
              ),
            },
            "Tool execution completed",
          );
          return { toolCallId, success: true, content: result };
        } catch (error) {
          recordMetric("failed");
          setSpanError(span, error);
          const message =
            error instanceof Error ? error.message : String(error);
          toolLogger.error(
            { error, errorMessage: message },
            "Tool execution failed",
          );
          return { toolCallId, success: false, error: message };
        }
      },
    );
  }

  exportForAISdk(): Record<
    string,
    { description: string; parameters: z.ZodType }
  > {
    const result: Record<
      string,
      { description: string; parameters: z.ZodType }
    > = {};
    for (const [name, handler] of this.tools) {
      result[name] = {
        description: handler.definition.description,
        parameters: handler.definition.inputSchema,
      };
    }
    return result;
  }
}
