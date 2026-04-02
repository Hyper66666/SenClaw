import type { AgentTaskStatus, RunStatus } from "@senclaw/protocol";

export type StatusBadgeVariant = "default" | "success" | "warning" | "danger";

export function getRunStatusVariant(status: RunStatus): StatusBadgeVariant {
  switch (status) {
    case "completed":
      return "success";
    case "running":
      return "warning";
    case "failed":
      return "danger";
    default:
      return "default";
  }
}

export function getAgentTaskStatusVariant(
  status: AgentTaskStatus,
): StatusBadgeVariant {
  switch (status) {
    case "completed":
      return "success";
    case "running":
      return "warning";
    case "failed":
    case "killed":
      return "danger";
    default:
      return "default";
  }
}

export function getHealthStatusVariant(status: string): StatusBadgeVariant {
  switch (status) {
    case "healthy":
      return "success";
    case "degraded":
      return "warning";
    case "unhealthy":
      return "danger";
    default:
      return "default";
  }
}
