import { performance } from "node:perf_hooks";
import { generateText, stepCountIs, tool as aiTool } from "ai";
import { createChildLogger, createLogger } from "@senclaw/logging";
import {
  getMetricsRegistry,
  setSpanError,
  setSpanOk,
  withActiveSpan,
} from "@senclaw/observability";
import type {
  Agent,
  IMessageRepository,
  IRunRepository,
  Message,
  ToolResult,
} from "@senclaw/protocol";
import type { ToolRegistry } from "@senclaw/tool-runner-host";
import { resolveModel } from "./model-provider.js";

const logger = createLogger(
  "agent-runner",
  (process.env.SENCLAW_LOG_LEVEL as
    | "trace"
    | "debug"
    | "info"
    | "warn"
    | "error"
    | "fatal"
    | undefined) ?? "info",
);

export interface ExecutionOptions {
  maxTurns: number;
  llmTimeoutMs: number;
}

export async function executeRun(
  runId: string,
  agent: Agent,
  userInput: string,
  toolRegistry: ToolRegistry,
  runRepo: IRunRepository,
  messageRepo: IMessageRepository,
  options: ExecutionOptions,
): Promise<void> {
  const startedAt = performance.now();
  let metricStatus: "success" | "failed" = "failed";
  const runLogger = createChildLogger(logger, {
    agentId: agent.id,
    runId,
  });

  await runRepo.updateStatus(runId, "running");

  const systemMsg: Message = { role: "system", content: agent.systemPrompt };
  const userMsg: Message = { role: "user", content: userInput };
  await messageRepo.append(runId, systemMsg);
  await messageRepo.append(runId, userMsg);

  try {
    await withActiveSpan(
      "agent.execute",
      {
        tracerName: "senclaw-agent-runner",
        kind: "internal",
        setOkStatusOnSuccess: false,
        attributes: {
          "agent.id": agent.id,
          "agent.name": agent.name,
          "agent.provider": agent.provider.provider,
          "agent.model": agent.provider.model,
          "run.id": runId,
        },
      },
      async (agentSpan) => {
        runLogger.info("Agent execution started");
        let model: import("ai").LanguageModel;
        try {
          model = resolveModel(agent.provider);
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error);
          setSpanError(agentSpan, error);
          runLogger.error({ error }, "Failed to resolve model provider");
          await runRepo.updateStatus(runId, "failed", errMsg);
          return;
        }

        const registeredTools = toolRegistry.listTools();
        const toolsForSdk: Record<string, unknown> = {};
        for (const def of registeredTools) {
          if (agent.tools.length > 0 && !agent.tools.includes(def.name))
            continue;
          const toolName = def.name;
          toolsForSdk[toolName] = aiTool({
            description: def.description,
            inputSchema: def.inputSchema,
            execute: async (input: unknown) => {
              const result: ToolResult = await toolRegistry.executeTool(
                `call-${toolName}-${Date.now()}`,
                toolName,
                input,
              );
              return result.success
                ? (result.content ?? "")
                : `Error: ${result.error ?? "Unknown error"}`;
            },
          });
        }

        try {
          const controller = new AbortController();
          const totalTimeoutMs = options.llmTimeoutMs * options.maxTurns;
          const timer = setTimeout(() => controller.abort(), totalTimeoutMs);
          const llmLogger = createChildLogger(runLogger, {
            provider: agent.provider.provider,
            model: agent.provider.model,
          });

          const result = await withActiveSpan(
            "llm.call",
            {
              tracerName: "senclaw-agent-runner",
              kind: "client",
              attributes: {
                "llm.provider": agent.provider.provider,
                "llm.model": agent.provider.model,
              },
            },
            async (llmSpan) => {
              llmLogger.debug("LLM call started");
              const response = await generateText({
                model,
                system: agent.systemPrompt,
                messages: [{ role: "user" as const, content: userInput }],
                tools: toolsForSdk as Parameters<
                  typeof generateText
                >[0]["tools"],
                stopWhen: stepCountIs(options.maxTurns),
                abortSignal: controller.signal,
              });

              const usage = response.usage as
                | { inputTokens?: number; outputTokens?: number }
                | undefined;
              if (usage?.inputTokens !== undefined) {
                llmSpan.setAttribute("llm.tokens.input", usage.inputTokens);
              }
              if (usage?.outputTokens !== undefined) {
                llmSpan.setAttribute("llm.tokens.output", usage.outputTokens);
              }
              llmLogger.info(
                {
                  inputTokens: usage?.inputTokens,
                  outputTokens: usage?.outputTokens,
                },
                "LLM call completed",
              );
              return response;
            },
          );

          clearTimeout(timer);

          if (result.steps) {
            for (const step of result.steps) {
              if (step.toolCalls && step.toolCalls.length > 0) {
                const assistantMsg: Message = {
                  role: "assistant",
                  toolCalls: step.toolCalls.map(
                    (tc: {
                      toolCallId: string;
                      toolName: string;
                      args?: Record<string, unknown>;
                      input?: unknown;
                    }) => ({
                      toolCallId: tc.toolCallId,
                      toolName: tc.toolName,
                      args: (tc.args ?? tc.input ?? {}) as Record<
                        string,
                        unknown
                      >,
                    }),
                  ),
                };
                await messageRepo.append(runId, assistantMsg);

                if (step.toolResults) {
                  for (const tr of step.toolResults) {
                    const output =
                      (
                        tr as {
                          toolCallId: string;
                          output?: unknown;
                          result?: unknown;
                        }
                      ).output ??
                      (tr as { result?: unknown }).result ??
                      "";
                    const toolMsg: Message = {
                      role: "tool",
                      toolCallId: (tr as { toolCallId: string }).toolCallId,
                      content:
                        typeof output === "string"
                          ? output
                          : JSON.stringify(output),
                    };
                    await messageRepo.append(runId, toolMsg);
                  }
                }
              }

              if (step.text) {
                const textMsg: Message = {
                  role: "assistant",
                  content: step.text,
                };
                await messageRepo.append(runId, textMsg);
              }
            }
          }

          if (
            result.finishReason === "stop" ||
            result.finishReason === "other"
          ) {
            if (!result.steps || result.steps.length === 0) {
              const finalMsg: Message = {
                role: "assistant",
                content: result.text,
              };
              await messageRepo.append(runId, finalMsg);
            }
            await runRepo.updateStatus(runId, "completed");
            metricStatus = "success";
            setSpanOk(agentSpan);
            runLogger.info("Agent execution completed");
          } else if (result.finishReason === "length") {
            const turnLimitError = new Error("Maximum turn limit exceeded");
            setSpanError(agentSpan, turnLimitError);
            runLogger.warn(
              { error: turnLimitError.message },
              "Agent execution hit the configured turn limit",
            );
            await runRepo.updateStatus(runId, "failed", turnLimitError.message);
          } else {
            await runRepo.updateStatus(runId, "completed");
            metricStatus = "success";
            setSpanOk(agentSpan);
            runLogger.info(
              { finishReason: result.finishReason },
              "Agent execution completed",
            );
          }
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error);
          setSpanError(agentSpan, error);
          runLogger.error({ error }, "Agent execution failed");
          await runRepo.updateStatus(runId, "failed", errMsg);
        }
      },
    );
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    runLogger.error({ error }, "Agent execution failed before span setup");
    await runRepo.updateStatus(runId, "failed", errMsg);
  } finally {
    getMetricsRegistry().recordAgentExecution({
      agentId: agent.id,
      status: metricStatus,
      durationSeconds: Math.max(0, performance.now() - startedAt) / 1000,
    });
  }
}
