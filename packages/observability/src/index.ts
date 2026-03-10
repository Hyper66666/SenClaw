import {
  Counter,
  Gauge,
  Histogram,
  Registry,
  type CounterConfiguration,
  type GaugeConfiguration,
  type HistogramConfiguration,
} from "prom-client";
export * from "./tracing.js";

export type HealthStatus = "healthy" | "degraded" | "unhealthy";

export interface HealthCheckResult {
  status: HealthStatus;
  detail?: string;
}

export interface HealthCheck {
  check(): HealthCheckResult | Promise<HealthCheckResult>;
}

export type MetricLabels = Record<string, string>;

export interface MetricsCollector {
  increment(name: string, labels?: MetricLabels): void;
  observe(name: string, value: number, labels?: MetricLabels): void;
}

export interface MetricsRegistryOptions {
  enabled?: boolean;
}

export interface HttpMetricRecord {
  method: string;
  path: string;
  status: string;
  durationSeconds: number;
}

export interface AgentExecutionMetricRecord {
  agentId: string;
  status: "success" | "failed";
  durationSeconds: number;
}

export interface ToolCallMetricRecord {
  toolName: string;
  status: "success" | "failed";
  durationSeconds: number;
}

export interface DatabaseQueryMetricRecord {
  operation: string;
  durationSeconds: number;
}

function cloneLabelNames(labelNames: readonly string[]): string[] {
  return [...labelNames];
}

export class MetricsRegistry {
  readonly registry: Registry;
  readonly enabled: boolean;
  private readonly counters = new Map<string, Counter<string>>();
  private readonly histograms = new Map<string, Histogram<string>>();
  private readonly gauges = new Map<string, Gauge<string>>();
  private readonly httpRequestsTotal: Counter<string>;
  private readonly httpRequestDurationSeconds: Histogram<string>;
  private readonly agentExecutionsTotal: Counter<string>;
  private readonly agentExecutionDurationSeconds: Histogram<string>;
  private readonly toolCallsTotal: Counter<string>;
  private readonly toolCallDurationSeconds: Histogram<string>;
  private readonly dbQueryDurationSeconds: Histogram<string>;

  constructor(options: MetricsRegistryOptions = {}) {
    this.enabled = options.enabled ?? true;
    this.registry = new Registry();

    this.httpRequestsTotal = this.registerCounter({
      name: "http_requests_total",
      help: "Total number of HTTP requests.",
      labelNames: ["method", "path", "status"],
    });
    this.httpRequestDurationSeconds = this.registerHistogram({
      name: "http_request_duration_seconds",
      help: "HTTP request duration in seconds.",
      labelNames: ["method", "path", "status"],
      buckets: [0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5],
    });
    this.agentExecutionsTotal = this.registerCounter({
      name: "agent_executions_total",
      help: "Total number of agent executions.",
      labelNames: ["agent_id", "status"],
    });
    this.agentExecutionDurationSeconds = this.registerHistogram({
      name: "agent_execution_duration_seconds",
      help: "Agent execution duration in seconds.",
      labelNames: ["agent_id"],
      buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60, 120],
    });
    this.toolCallsTotal = this.registerCounter({
      name: "tool_calls_total",
      help: "Total number of tool calls.",
      labelNames: ["tool_name", "status"],
    });
    this.toolCallDurationSeconds = this.registerHistogram({
      name: "tool_call_duration_seconds",
      help: "Tool call duration in seconds.",
      labelNames: ["tool_name"],
      buckets: [0.001, 0.01, 0.05, 0.1, 0.5, 1, 5, 10],
    });
    this.dbQueryDurationSeconds = this.registerHistogram({
      name: "db_query_duration_seconds",
      help: "Database query duration in seconds.",
      labelNames: ["operation"],
      buckets: [0.0005, 0.001, 0.005, 0.01, 0.05, 0.1, 0.5],
    });
  }

  registerCounter(config: CounterConfiguration<string>): Counter<string> {
    const existing = this.counters.get(config.name);
    if (existing) {
      return existing;
    }

    const counter = new Counter({
      ...config,
      labelNames: cloneLabelNames(config.labelNames ?? []),
      registers: [this.registry],
    });
    this.counters.set(config.name, counter);
    return counter;
  }

  registerHistogram(config: HistogramConfiguration<string>): Histogram<string> {
    const existing = this.histograms.get(config.name);
    if (existing) {
      return existing;
    }

    const histogram = new Histogram({
      ...config,
      labelNames: cloneLabelNames(config.labelNames ?? []),
      registers: [this.registry],
    });
    this.histograms.set(config.name, histogram);
    return histogram;
  }

  registerGauge(config: GaugeConfiguration<string>): Gauge<string> {
    const existing = this.gauges.get(config.name);
    if (existing) {
      return existing;
    }

    const gauge = new Gauge({
      ...config,
      labelNames: cloneLabelNames(config.labelNames ?? []),
      registers: [this.registry],
    });
    this.gauges.set(config.name, gauge);
    return gauge;
  }

  contentType(): string {
    return this.registry.contentType;
  }

  async metrics(): Promise<string> {
    return this.registry.metrics();
  }

  reset(): void {
    this.registry.resetMetrics();
  }

  recordHttpRequest(record: HttpMetricRecord): void {
    if (!this.enabled) {
      return;
    }

    const labels = {
      method: record.method,
      path: record.path,
      status: record.status,
    };
    this.httpRequestsTotal.inc(labels);
    this.httpRequestDurationSeconds.observe(labels, record.durationSeconds);
  }

  recordAgentExecution(record: AgentExecutionMetricRecord): void {
    if (!this.enabled) {
      return;
    }

    this.agentExecutionsTotal.inc({
      agent_id: record.agentId,
      status: record.status,
    });
    this.agentExecutionDurationSeconds.observe(
      { agent_id: record.agentId },
      record.durationSeconds,
    );
  }

  recordToolCall(record: ToolCallMetricRecord): void {
    if (!this.enabled) {
      return;
    }

    this.toolCallsTotal.inc({
      tool_name: record.toolName,
      status: record.status,
    });
    this.toolCallDurationSeconds.observe(
      { tool_name: record.toolName },
      record.durationSeconds,
    );
  }

  recordDatabaseQuery(record: DatabaseQueryMetricRecord): void {
    if (!this.enabled) {
      return;
    }

    this.dbQueryDurationSeconds.observe(
      { operation: record.operation },
      record.durationSeconds,
    );
  }
}

let defaultMetricsRegistry: MetricsRegistry | undefined;

export function configureMetricsRegistry(
  options: MetricsRegistryOptions = {},
): MetricsRegistry {
  defaultMetricsRegistry = new MetricsRegistry(options);
  return defaultMetricsRegistry;
}

export function getMetricsRegistry(): MetricsRegistry {
  defaultMetricsRegistry ??= new MetricsRegistry();
  return defaultMetricsRegistry;
}

export function resetMetricsRegistry(
  options: MetricsRegistryOptions = {},
): MetricsRegistry {
  return configureMetricsRegistry(options);
}

function labelKey(name: string, labels?: MetricLabels): string {
  if (!labels || Object.keys(labels).length === 0) return name;
  const sorted = Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join(",");
  return `${name}{${sorted}}`;
}

export class InMemoryMetrics implements MetricsCollector {
  private counters = new Map<string, number>();
  private observations = new Map<string, number[]>();

  increment(name: string, labels?: MetricLabels): void {
    const key = labelKey(name, labels);
    this.counters.set(key, (this.counters.get(key) ?? 0) + 1);
  }

  observe(name: string, value: number, labels?: MetricLabels): void {
    const key = labelKey(name, labels);
    const existing = this.observations.get(key) ?? [];
    existing.push(value);
    this.observations.set(key, existing);
  }

  getCounter(name: string, labels?: MetricLabels): number {
    return this.counters.get(labelKey(name, labels)) ?? 0;
  }

  getObservations(name: string, labels?: MetricLabels): number[] {
    return this.observations.get(labelKey(name, labels)) ?? [];
  }

  reset(): void {
    this.counters.clear();
    this.observations.clear();
  }
}
