import type { Agent, ToolDefinition } from "@senclaw/protocol";

export const COORDINATOR_MODE_PROMPT = [
  "You are operating in coordinator mode.",
  "Answer directly when delegation is unnecessary.",
  "Delegate only when specialized or long-running work is warranted.",
  "Reuse an existing worker when it already covers the current workstream instead of always creating a new one.",
  "Use only the provided orchestration tools for worker lifecycle, inspection, and communication.",
].join(" ");

export function isCoordinatorAgent(agent: Pick<Agent, "mode">): boolean {
  return agent.mode === "coordinator";
}

export function buildRuntimeSystemPrompt(agent: Agent): string {
  if (!isCoordinatorAgent(agent)) {
    return agent.systemPrompt;
  }

  return `${agent.systemPrompt}\n\n${COORDINATOR_MODE_PROMPT}`;
}

export function getCoordinatorAllowedToolNames(
  tools: readonly Pick<ToolDefinition, "name">[],
): string[] {
  return tools
    .map((tool) => tool.name)
    .filter((name) => name.startsWith("agent_tasks."));
}

export function isToolAllowedForAgent(
  agent: Pick<Agent, "mode" | "tools">,
  toolName: string,
  availableCoordinatorTools: readonly string[],
): boolean {
  if (
    isCoordinatorAgent(agent) &&
    !availableCoordinatorTools.includes(toolName)
  ) {
    return false;
  }

  if (agent.tools.length === 0) {
    return true;
  }

  return agent.tools.includes(toolName);
}

export interface CoordinatorActionDecisionInput {
  requiresDelegation: boolean;
  existingTaskId?: string;
}

export type CoordinatorActionDecision =
  | { action: "direct"; reason: string }
  | { action: "reuse"; taskId: string; reason: string }
  | { action: "spawn"; reason: string };

export function decideCoordinatorAction(
  input: CoordinatorActionDecisionInput,
): CoordinatorActionDecision {
  if (!input.requiresDelegation) {
    return {
      action: "direct",
      reason: "The current task can be answered directly without a worker.",
    };
  }

  if (input.existingTaskId) {
    return {
      action: "reuse",
      taskId: input.existingTaskId,
      reason: "A relevant worker already exists and should be continued.",
    };
  }

  return {
    action: "spawn",
    reason: "Specialized or long-running work requires a new worker.",
  };
}
