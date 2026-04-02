import type {
  Agent,
  AgentTask,
  AgentTaskPendingMessage,
  CreateAgent,
  Message,
  Run,
  Task,
} from "@senclaw/protocol";
import {
  ApiResponseError,
  MissingApiKeyError,
  createApiClient,
} from "../api-client";
import { loadStoredApiKey } from "./auth-session";

export interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  checks: Record<
    string,
    {
      status: "healthy" | "degraded" | "unhealthy";
      detail?: string;
    }
  >;
}

export interface CreateBackgroundAgentTaskRequest {
  agentId: string;
  input: string;
  parentRunId?: string;
  parentTaskId?: string;
  metadata?: Record<string, unknown>;
}

export interface SendAgentTaskMessageRequest {
  content: string;
  role?: AgentTaskPendingMessage["role"];
}

export { ApiResponseError as APIError, MissingApiKeyError };
export type {
  Agent,
  AgentTask,
  AgentTaskPendingMessage,
  CreateAgent,
  Message,
  Run,
  Task,
};

const apiClient = createApiClient({
  getApiKey: loadStoredApiKey,
});

export const agentAPI = {
  list: () => apiClient.request<Agent[]>("/api/v1/agents"),
  get: (id: string) => apiClient.request<Agent>(`/api/v1/agents/${id}`),
  create: (data: CreateAgent) =>
    apiClient.request<Agent>("/api/v1/agents", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    apiClient.request<void>(`/api/v1/agents/${id}`, { method: "DELETE" }),
};

export const taskAPI = {
  submit: (task: Task) =>
    apiClient.request<Run>("/api/v1/tasks", {
      method: "POST",
      body: JSON.stringify(task),
    }),
};

export const agentTaskAPI = {
  createBackground: (request: CreateBackgroundAgentTaskRequest) =>
    apiClient.request<AgentTask>("/api/v1/agent-tasks/background", {
      method: "POST",
      body: JSON.stringify(request),
    }),
  list: () => apiClient.request<AgentTask[]>("/api/v1/agent-tasks"),
  get: (id: string) =>
    apiClient.request<AgentTask>(`/api/v1/agent-tasks/${id}`),
  getMessages: (id: string) =>
    apiClient.request<Message[]>(`/api/v1/agent-tasks/${id}/messages`),
  sendMessage: (id: string, request: SendAgentTaskMessageRequest) =>
    apiClient.request<AgentTaskPendingMessage>(
      `/api/v1/agent-tasks/${id}/messages`,
      {
        method: "POST",
        body: JSON.stringify(request),
      },
    ),
  resume: (id: string) =>
    apiClient.request<AgentTask>(`/api/v1/agent-tasks/${id}/resume`, {
      method: "POST",
    }),
};

export const runAPI = {
  get: (id: string) => apiClient.request<Run>(`/api/v1/runs/${id}`),
  list: () => apiClient.request<Run[]>("/api/v1/runs"),
  getMessages: (id: string) =>
    apiClient.request<Message[]>(`/api/v1/runs/${id}/messages`),
};

export const healthAPI = {
  check: () => apiClient.request<HealthStatus>("/api/runtime/health"),
};
