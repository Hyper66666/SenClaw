import { randomUUID } from "node:crypto";
import type { Agent, AgentRunLink, Message } from "@senclaw/protocol";

export type ResponseLength = "short" | "medium" | "long";

export interface AgentRuntimeContext {
  runtimeId: string;
  agent: Agent;
  messages: Message[];
  cwd?: string;
  link?: AgentRunLink;
  abortController: AbortController;
  toolDecisionCache: Map<string, unknown>;
  responseLength: ResponseLength;
  metadata: Record<string, unknown>;
}

export interface CreateSubagentContextOptions {
  agent?: Agent;
  messages?: Message[];
  cwd?: string;
  link?: AgentRunLink;
  metadata?: Record<string, unknown>;
  runtimeId?: string;
  shareAbortController?: boolean;
  shareToolDecisionCache?: boolean;
  shareResponseLength?: boolean;
  abortController?: AbortController;
  toolDecisionCache?: Map<string, unknown>;
  responseLength?: ResponseLength;
}

function cloneMessages(messages: Message[]): Message[] {
  return messages.map((message) => structuredClone(message));
}

export function createSubagentContext(
  parent: AgentRuntimeContext,
  options: CreateSubagentContextOptions = {},
): AgentRuntimeContext {
  if (options.shareAbortController && options.abortController) {
    throw new Error(
      "Cannot provide an explicit abortController when shareAbortController is enabled.",
    );
  }

  if (options.shareToolDecisionCache && options.toolDecisionCache) {
    throw new Error(
      "Cannot provide an explicit toolDecisionCache when shareToolDecisionCache is enabled.",
    );
  }

  if (options.shareResponseLength && options.responseLength) {
    throw new Error(
      "Cannot override responseLength when shareResponseLength is enabled.",
    );
  }

  return {
    runtimeId: options.runtimeId ?? randomUUID(),
    agent: options.agent ?? parent.agent,
    messages: options.messages
      ? cloneMessages(options.messages)
      : cloneMessages(parent.messages),
    cwd: options.cwd ?? parent.cwd,
    link: options.link ?? parent.link,
    abortController: options.shareAbortController
      ? parent.abortController
      : (options.abortController ?? new AbortController()),
    toolDecisionCache: options.shareToolDecisionCache
      ? parent.toolDecisionCache
      : new Map(options.toolDecisionCache ?? parent.toolDecisionCache),
    responseLength: options.shareResponseLength
      ? parent.responseLength
      : (options.responseLength ?? parent.responseLength),
    metadata: { ...(options.metadata ?? parent.metadata) },
  };
}
