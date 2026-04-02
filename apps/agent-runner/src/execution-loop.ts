import { performance } from "node:perf_hooks";
import { createChildLogger, createLogger } from "@senclaw/logging";
import {
  getMetricsRegistry,
  setSpanError,
  setSpanOk,
  withActiveSpan,
} from "@senclaw/observability";
import type {
  Agent,
  AgentRunLink,
  IMessageRepository,
  IRunRepository,
  Message,
  ToolResult,
} from "@senclaw/protocol";
import type { ToolRegistry } from "@senclaw/tool-runner-host";
import { tool as aiTool, generateText, stepCountIs } from "ai";
import {
  buildRuntimeSystemPrompt,
  getCoordinatorAllowedToolNames,
  isToolAllowedForAgent,
} from "./coordinator-mode.js";
import { resolveModel } from "./model-provider.js";
import { markRunFailed } from "./run-failure.js";

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

export interface RunExecutionRequest {
  runId: string;
  agent: Agent;
  userInput: string;
  toolRegistry: ToolRegistry;
  runRepo: IRunRepository;
  messageRepo: IMessageRepository;
  options: ExecutionOptions;
  link?: AgentRunLink;
  historyMessages?: Message[];
}

export function formatToolResultForModel(result: ToolResult): string {
  if (result.success) {
    return result.content ?? "";
  }

  if (result.approvalRequired) {
    const approvalId = result.approvalRequestId
      ? ` Approval request ID: ${result.approvalRequestId}.`
      : "";
    return `Approval required: ${result.error ?? "This action requires operator approval."}${approvalId}`;
  }

  return `Error: ${result.error ?? "Unknown error"}`;
}

function renderAssistantHistory(
  message: Extract<Message, { role: "assistant" }>,
): string {
  if (message.content && message.content.length > 0) {
    return message.content;
  }

  if (message.toolCalls?.length) {
    return message.toolCalls
      .map((call) => `Tool call ${call.toolName}(${JSON.stringify(call.args)})`)
      .join("\n");
  }

  return "Assistant response";
}

function toModelHistoryMessages(messages: Message[]): Array<{
  role: "user" | "assistant";
  content: string;
}> {
  const normalized: Array<{ role: "user" | "assistant"; content: string }> = [];

  for (const message of messages) {
    if (message.role === "system") {
      continue;
    }
    if (message.role === "user") {
      normalized.push({ role: "user", content: message.content });
      continue;
    }
    if (message.role === "assistant") {
      normalized.push({
        role: "assistant",
        content: renderAssistantHistory(message),
      });
      continue;
    }

    normalized.push({
      role: "assistant",
      content: `Tool result (${message.toolCallId}): ${message.content}`,
    });
  }

  return normalized;
}

export async function executeRunRequest(
  request: RunExecutionRequest,
): Promise<void> {
  const {
    runId,
    agent,
    userInput,
    toolRegistry,
    runRepo,
    messageRepo,
    options,
    link,
    historyMessages = [],
  } = request;
  const startedAt = performance.now();
  let metricStatus: "success" | "failed" = "failed";
  const runLogger = createChildLogger(logger, {
    agentId: agent.id,
    runId,
    ...(link?.parentRunId ? { parentRunId: link.parentRunId } : {}),
    ...(link?.agentTaskId ? { agentTaskId: link.agentTaskId } : {}),
  });

  await runRepo.updateStatus(runId, "running");

  const runtimeSystemPrompt = buildRuntimeSystemPrompt(agent);
  const systemMsg: Message = { role: "system", content: runtimeSystemPrompt };
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
          ...(link?.parentRunId ? { "run.parent_id": link.parentRunId } : {}),
          ...(link?.agentTaskId ? { "agent.task_id": link.agentTaskId } : {}),
        },
      },
      async (agentSpan) => {
        runLogger.info("Agent execution started");
        let model: import("ai").LanguageModel;
        try {
          model = resolveModel(agent.provider);
        } catch (error) {
          setSpanError(agentSpan, error);
          runLogger.error({ error }, "Failed to resolve model provider");
          await markRunFailed(runId, error, runRepo, runLogger);
          return;
        }

        const registeredTools = toolRegistry.listTools();
        const toolsForSdk: Record<string, unknown> = {};
        for (const def of registeredTools) {
          if (agent.tools.length > 0 && !agent.tools.includes(def.name)) {
            continue;
          }
          const toolName = def.name;
          const coordinatorTools =
            getCoordinatorAllowedToolNames(registeredTools);
          if (!isToolAllowedForAgent(agent, toolName, coordinatorTools)) {
            continue;
          }
          toolsForSdk[toolName] = aiTool({
            description: def.description,
            inputSchema: def.inputSchema,
            execute: async (input: unknown) => {
              const result: ToolResult = await toolRegistry.executeTool(
                `call-${toolName}-${Date.now()}`,
                toolName,
                input,
              );
              return formatToolResultForModel(result);
            },
          });
        }

        const controller = new AbortController();
        const maxTurns = agent.maxTurns ?? options.maxTurns;
        const totalTimeoutMs = options.llmTimeoutMs * maxTurns;
        const timer = setTimeout(() => controller.abort(), totalTimeoutMs);

        try {
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
                system: runtimeSystemPrompt,
                messages: [
                  ...toModelHistoryMessages(historyMessages),
                  { role: "user" as const, content: userInput },
                ],
                tools: toolsForSdk as Parameters<
                  typeof generateText
                >[0]["tools"],
                stopWhen: stepCountIs(maxTurns),
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
            await markRunFailed(runId, turnLimitError, runRepo, runLogger);
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
          setSpanError(agentSpan, error);
          runLogger.error({ error }, "Agent execution failed");
          await markRunFailed(runId, error, runRepo, runLogger);
        } finally {
          clearTimeout(timer);
        }
      },
    );
  } catch (error) {
    runLogger.error({ error }, "Agent execution failed before span setup");
    await markRunFailed(runId, error, runRepo, runLogger);
  } finally {
    getMetricsRegistry().recordAgentExecution({
      agentId: agent.id,
      status: metricStatus,
      durationSeconds: Math.max(0, performance.now() - startedAt) / 1000,
    });
  }
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
  return executeRunRequest({
    runId,
    agent,
    userInput,
    toolRegistry,
    runRepo,
    messageRepo,
    options,
  });
}
