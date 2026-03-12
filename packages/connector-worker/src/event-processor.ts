import { randomUUID } from "node:crypto";
import type {
  Connector,
  IConnectorEventRepository,
  Transformation,
  TransformationFilter,
} from "@senclaw/protocol";
import Handlebars from "handlebars";
import { JSONPath } from "jsonpath-plus";

export interface AgentService {
  submitTask(agentId: string, input: string): Promise<{ id: string }>;
}

export interface RetryPolicy {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  schedule?: (work: () => Promise<void>, delayMs: number) => Promise<void>;
}

export interface EventProcessorOptions {
  retryPolicy?: RetryPolicy;
}

const RETRYABLE_ERROR_CODES = new Set([
  "ECONNABORTED",
  "ECONNREFUSED",
  "ECONNRESET",
  "EAI_AGAIN",
  "ENETDOWN",
  "ENETUNREACH",
  "ENOTFOUND",
  "ETIMEDOUT",
]);

function defaultSchedule(
  work: () => Promise<void>,
  delayMs: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      void work().then(resolve, reject);
    }, delayMs);
  });
}

export class EventProcessor {
  private readonly retryPolicy: Required<RetryPolicy>;

  constructor(
    private readonly agentService: AgentService,
    private readonly eventRepo: IConnectorEventRepository,
    options: EventProcessorOptions = {},
  ) {
    this.retryPolicy = {
      maxRetries: options.retryPolicy?.maxRetries ?? 3,
      initialDelayMs: options.retryPolicy?.initialDelayMs ?? 1_000,
      maxDelayMs: options.retryPolicy?.maxDelayMs ?? 30_000,
      backoffMultiplier: options.retryPolicy?.backoffMultiplier ?? 2,
      schedule: options.retryPolicy?.schedule ?? defaultSchedule,
    };
  }

  async processEvent(connector: Connector, payload: unknown): Promise<void> {
    await this.processEventAttempt(connector, payload, 1);
  }

  private async processEventAttempt(
    connector: Connector,
    payload: unknown,
    attempt: number,
  ): Promise<void> {
    const eventId = randomUUID();

    try {
      await this.eventRepo.create({
        id: eventId,
        connectorId: connector.id,
        payload: JSON.stringify(payload),
        status: "pending",
        receivedAt: new Date().toISOString(),
      });

      if (!this.passesFilters(payload, connector.transformation.filters)) {
        await this.eventRepo.update(eventId, {
          status: "filtered",
          processedAt: new Date().toISOString(),
        });
        return;
      }

      const taskInput = this.transformPayload(
        payload,
        connector.transformation,
      );

      await this.eventRepo.update(eventId, {
        transformedInput: taskInput,
      });

      const run = await this.agentService.submitTask(
        connector.agentId,
        taskInput,
      );

      await this.eventRepo.update(eventId, {
        status: "submitted",
        runId: run.id,
        processedAt: new Date().toISOString(),
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      await this.eventRepo.update(eventId, {
        status: "failed",
        error: errorMsg,
        processedAt: new Date().toISOString(),
      });

      if (this.shouldRetry(error) && attempt <= this.retryPolicy.maxRetries) {
        const delayMs = this.computeRetryDelay(attempt);
        await this.retryPolicy.schedule(
          () => this.processEventAttempt(connector, payload, attempt + 1),
          delayMs,
        );
        return;
      }

      throw error;
    }
  }

  private shouldRetry(error: unknown): boolean {
    if (!error || typeof error !== "object") {
      return false;
    }

    const record = error as Record<string, unknown>;
    const statusCode =
      typeof record.statusCode === "number"
        ? record.statusCode
        : typeof record.status === "number"
          ? record.status
          : undefined;

    if (statusCode !== undefined) {
      if (statusCode === 429 || statusCode >= 500) {
        return true;
      }
      if (statusCode >= 400 && statusCode < 500) {
        return false;
      }
    }

    const code = typeof record.code === "string" ? record.code : undefined;
    return code ? RETRYABLE_ERROR_CODES.has(code) : false;
  }

  private computeRetryDelay(attempt: number): number {
    return Math.min(
      this.retryPolicy.initialDelayMs *
        this.retryPolicy.backoffMultiplier ** (attempt - 1),
      this.retryPolicy.maxDelayMs,
    );
  }

  private passesFilters(
    payload: unknown,
    filters?: TransformationFilter[],
  ): boolean {
    if (!filters || filters.length === 0) {
      return true;
    }

    for (const filter of filters) {
      const value = this.extractValue(payload, filter.field);

      if (!this.evaluateFilter(value, filter.operator, filter.value)) {
        return false;
      }
    }

    return true;
  }

  private evaluateFilter(
    actual: unknown,
    operator: TransformationFilter["operator"],
    expected: string | number | boolean,
  ): boolean {
    switch (operator) {
      case "equals":
        return actual === expected;
      case "not_equals":
        return actual !== expected;
      case "contains":
        return (
          typeof actual === "string" &&
          typeof expected === "string" &&
          actual.includes(expected)
        );
      case "not_contains":
        return (
          typeof actual === "string" &&
          typeof expected === "string" &&
          !actual.includes(expected)
        );
      case "starts_with":
        return (
          typeof actual === "string" &&
          typeof expected === "string" &&
          actual.startsWith(expected)
        );
      case "ends_with":
        return (
          typeof actual === "string" &&
          typeof expected === "string" &&
          actual.endsWith(expected)
        );
      case "greater_than":
        return (
          typeof actual === "number" &&
          typeof expected === "number" &&
          actual > expected
        );
      case "less_than":
        return (
          typeof actual === "number" &&
          typeof expected === "number" &&
          actual < expected
        );
      case "regex":
        return (
          typeof actual === "string" &&
          typeof expected === "string" &&
          new RegExp(expected).test(actual)
        );
      default:
        return false;
    }
  }

  private transformPayload(
    payload: unknown,
    transformation: Transformation,
  ): string {
    let result = "";

    if (transformation.jsonPath) {
      const extracted = this.extractValue(payload, transformation.jsonPath);
      result =
        typeof extracted === "string"
          ? extracted
          : (JSON.stringify(extracted) ?? transformation.fallback ?? "");
    }

    if (transformation.inputTemplate) {
      const template = Handlebars.compile(transformation.inputTemplate);
      result = template({ body: payload });
    }

    if (!transformation.jsonPath && !transformation.inputTemplate) {
      result =
        transformation.fallback ??
        (typeof payload === "string" ? payload : JSON.stringify(payload));
    }

    if (transformation.staticPrefix) {
      result = transformation.staticPrefix + result;
    }

    if (transformation.staticSuffix) {
      result = result + transformation.staticSuffix;
    }

    return result;
  }

  private extractValue(payload: unknown, jsonPath: string): unknown {
    try {
      const results = JSONPath({ path: jsonPath, json: payload as object });
      return Array.isArray(results) && results.length > 0
        ? results[0]
        : undefined;
    } catch {
      return undefined;
    }
  }
}
