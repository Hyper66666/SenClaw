import {
  ApiResponseError,
  MissingApiKeyError,
  createApiClient,
} from "../index";
import { loadStoredApiKey } from "./auth-session";

export interface Agent {
  id: string;
  name: string;
  systemPrompt: string;
  provider: {
    provider: string;
    model: string;
    temperature?: number;
    maxTokens?: number;
  };
  tools: string[];
}

export interface CreateAgent {
  name: string;
  systemPrompt: string;
  provider: {
    provider: string;
    model: string;
    temperature?: number;
    maxTokens?: number;
  };
  tools?: string[];
}

export interface Run {
  id: string;
  agentId: string;
  input: string;
  status: "pending" | "running" | "completed" | "failed";
  createdAt: string;
  updatedAt: string;
  error?: string;
}

export interface Message {
  role: "system" | "user" | "assistant" | "tool";
  content?: string;
  toolCalls?: Array<{
    id: string;
    name: string;
    arguments: string;
  }>;
  toolCallId?: string;
}

export interface Task {
  agentId: string;
  input: string;
}

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

export { ApiResponseError as APIError, MissingApiKeyError };

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

export const runAPI = {
  get: (id: string) => apiClient.request<Run>(`/api/v1/runs/${id}`),
  list: () => apiClient.request<Run[]>("/api/v1/runs"),
  getMessages: (id: string) =>
    apiClient.request<Message[]>(`/api/v1/runs/${id}/messages`),
};

export const healthAPI = {
  check: () => apiClient.request<HealthStatus>("/health"),
};
