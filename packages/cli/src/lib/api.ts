import {
  formatOperatorErrorMessage,
  parseApiErrorPayload,
  type Agent,
  type CreateAgent,
  type Message,
  type Run,
} from "@senclaw/protocol";
import axios, { type AxiosError, type AxiosInstance } from "axios";
import { loadConfig } from "./config.js";

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

export type { Agent, CreateAgent, Message, Run };

export class APIClient {
  private client: AxiosInstance;

  constructor(baseURL?: string, apiKey?: string) {
    const config = loadConfig();
    const resolvedApiKey = apiKey || config.apiKey;

    this.client = axios.create({
      baseURL: baseURL || config.gatewayUrl || "http://localhost:4100",
      headers: {
        Authorization: resolvedApiKey ? `Bearer ${resolvedApiKey}` : undefined,
      },
    });
  }

  async listAgents(): Promise<Agent[]> {
    const response = await this.client.get("/api/v1/agents");
    return response.data;
  }

  async getAgent(id: string): Promise<Agent> {
    const response = await this.client.get(`/api/v1/agents/${id}`);
    return response.data;
  }

  async createAgent(data: CreateAgent): Promise<Agent> {
    const response = await this.client.post("/api/v1/agents", data);
    return response.data;
  }

  async deleteAgent(id: string): Promise<void> {
    await this.client.delete(`/api/v1/agents/${id}`);
  }

  async submitTask(agentId: string, input: string): Promise<Run> {
    const response = await this.client.post("/api/v1/tasks", {
      agentId,
      input,
    });
    return response.data;
  }

  async getRun(id: string): Promise<Run> {
    const response = await this.client.get(`/api/v1/runs/${id}`);
    return response.data;
  }

  async getRunMessages(id: string): Promise<Message[]> {
    const response = await this.client.get(`/api/v1/runs/${id}/messages`);
    return response.data;
  }

  async getHealth(): Promise<HealthStatus> {
    const response = await this.client.get("/health");
    return response.data;
  }
}

export function handleAPIError(error: unknown): never {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<unknown>;

    if (axiosError.response) {
      const parsedError = parseApiErrorPayload(
        axiosError.response.data,
        `API error: ${axiosError.response.status}`,
      );

      throw new Error(
        formatOperatorErrorMessage(
          axiosError.response.status,
          parsedError.message,
        ),
      );
    }

    if (axiosError.request) {
      throw new Error(
        "Cannot connect to Senclaw gateway. Make sure it's running.",
      );
    }
  }

  throw error;
}
