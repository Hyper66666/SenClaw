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

export interface PendingApprovalToolExecution {
  type: "approval_required";
  approvalRequestId: string;
  message: string;
}

export type ToolExecutionOutput = string | PendingApprovalToolExecution;

export interface ToolExecutionContext {
  signal: AbortSignal;
}

export interface ToolInvocation {
  toolCallId: string;
  toolName: string;
  args: unknown;
}

export interface ToolHandler<T = unknown> {
  definition: ToolDefinition;
  execute: (
    args: T,
    context?: ToolExecutionContext,
  ) => Promise<ToolExecutionOutput> | ToolExecutionOutput;
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

function isPendingApprovalResult(
  value: ToolExecutionOutput,
): value is PendingApprovalToolExecution {
  return typeof value !== "string" && value.type === "approval_required";
}

function createBatchAbortError(reason?: unknown): Error {
  if (reason instanceof Error) {
    return reason;
  }

  return new Error("Tool batch cancelled due to sibling failure");
}

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
    handler: (
      args: z.infer<T>,
      context?: ToolExecutionContext,
    ) => Promise<ToolExecutionOutput> | ToolExecutionOutput,
  ): void {
    if (this.tools.has(definition.name)) {
      throw new Error(`Tool "${definition.name}" is already registered`);
    }
    this.tools.set(definition.name, {
      definition,
      execute: handler as (
        args: unknown,
        context?: ToolExecutionContext,
      ) => Promise<ToolExecutionOutput> | ToolExecutionOutput,
    });
  }

  getTool(name: string): ToolHandler | undefined {
    return this.tools.get(name);
  }

  listTools(): ToolDefinition[] {
    return Array.from(this.tools.values()).map((t) => t.definition);
  }

  private isConcurrencySafe(definition: ToolDefinition | undefined): boolean {
    return definition?.concurrency?.safe === true;
  }

  private shouldCancelSiblingsOnFailure(
    definition: ToolDefinition | undefined,
  ): boolean {
    return definition?.concurrency?.cancelSiblingsOnFailure === true;
  }

  private async invokeHandler(
    handler: ToolHandler,
    args: unknown,
    signal?: AbortSignal,
  ): Promise<ToolExecutionOutput> {
    const context: ToolExecutionContext = {
      signal: signal ?? new AbortController().signal,
    };

    if (context.signal.aborted) {
      throw createBatchAbortError(context.signal.reason);
    }

    const abortPromise = signal
      ? new Promise<never>((_resolve, reject) => {
          signal.addEventListener(
            "abort",
            () => reject(createBatchAbortError(signal.reason)),
            { once: true },
          );
        })
      : undefined;

    const executePromise =
      (handler.definition.sandbox?.level ?? 0) >= 1
        ? (this.sandboxRunner.execute(
            handler,
            args,
          ) as Promise<ToolExecutionOutput>)
        : Promise.race([
            Promise.resolve(handler.execute(args, context)),
            new Promise<never>((_resolve, reject) =>
              setTimeout(
                () => reject(new Error("Tool execution timed out")),
                this.timeoutMs,
              ),
            ),
          ]);

    return abortPromise
      ? Promise.race([executePromise, abortPromise])
      : executePromise;
  }

  private async executeToolInternal(
    invocation: ToolInvocation,
    signal?: AbortSignal,
  ): Promise<ToolResult> {
    const { toolCallId, toolName, args } = invocation;
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
            {
              sandboxLevel: handler.definition.sandbox?.level ?? 0,
              concurrencySafe: this.isConcurrencySafe(handler.definition),
            },
            "Tool execution started",
          );
          const result = await this.invokeHandler(
            handler,
            parseResult.data,
            signal,
          );

          if (isPendingApprovalResult(result)) {
            recordMetric("failed");
            setSpanError(span, result.message);
            toolLogger.warn(
              { approvalRequestId: result.approvalRequestId },
              "Tool execution is waiting for approval",
            );
            return {
              toolCallId,
              success: false,
              error: result.message,
              approvalRequired: true,
              approvalRequestId: result.approvalRequestId,
            };
          }

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

  async executeTool(
    toolCallId: string,
    toolName: string,
    args: unknown,
  ): Promise<ToolResult> {
    return this.executeToolInternal({ toolCallId, toolName, args });
  }

  private async executeConcurrentBatch(
    invocations: ToolInvocation[],
  ): Promise<ToolResult[]> {
    const controllers = invocations.map(() => new AbortController());

    return Promise.all(
      invocations.map(async (invocation, index) => {
        const result = await this.executeToolInternal(
          invocation,
          controllers[index].signal,
        );

        if (!result.success) {
          const handler = this.tools.get(invocation.toolName);
          if (this.shouldCancelSiblingsOnFailure(handler?.definition)) {
            for (const [otherIndex, controller] of controllers.entries()) {
              if (otherIndex !== index && !controller.signal.aborted) {
                controller.abort(
                  new Error("Tool batch cancelled due to sibling failure"),
                );
              }
            }
          }
        }

        return result;
      }),
    );
  }

  async executeTools(invocations: ToolInvocation[]): Promise<ToolResult[]> {
    const results: ToolResult[] = [];
    let concurrentBatch: ToolInvocation[] = [];

    const flushBatch = async () => {
      if (concurrentBatch.length === 0) {
        return;
      }
      results.push(...(await this.executeConcurrentBatch(concurrentBatch)));
      concurrentBatch = [];
    };

    for (const invocation of invocations) {
      const handler = this.tools.get(invocation.toolName);
      if (this.isConcurrencySafe(handler?.definition)) {
        concurrentBatch.push(invocation);
        continue;
      }

      await flushBatch();
      results.push(await this.executeToolInternal(invocation));
    }

    await flushBatch();
    return results;
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
