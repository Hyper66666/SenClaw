# Observability Enhancement — Design Document

## Overview

Observability Enhancement adds comprehensive monitoring, metrics collection, distributed tracing, and dashboards to Senclaw. It enables operators to understand system behavior, diagnose issues, and optimize performance.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Senclaw Services                          │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Gateway, Agent Runner, Scheduler, Connector Worker  │  │
│  │  - Instrumented with metrics                         │  │
│  │  - Instrumented with tracing                         │  │
│  │  - Structured logging with trace context             │  │
│  └───────────────────────────────────────────────────────┘  │
│                          ↓                                   │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  @senclaw/observability Package                       │  │
│  │  - Metrics Registry (prom-client)                    │  │
│  │  - Trace Provider (OpenTelemetry)                    │  │
│  │  - Logger (Pino with trace context)                  │  │
│  └───────────────────────────────────────────────────────┘  │
└──────────────────────────┬───────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│  Prometheus  │  │   Jaeger     │  │     Loki     │
│  (Metrics)   │  │  (Traces)    │  │    (Logs)    │
└──────┬───────┘  └──────┬───────┘  └──────┬───────┘
       │                 │                 │
       └─────────────────┼─────────────────┘
                         ▼
                 ┌──────────────┐
                 │   Grafana    │
                 │ (Dashboards) │
                 └──────────────┘
```

## Components

### 1. Metrics Collection (Prometheus)

**Purpose**: Track quantitative data (request counts, latencies, error rates)

**Implementation**: `prom-client` library

**Metrics Exposed**:
- HTTP request metrics (count, duration, status)
- Agent execution metrics (count, duration, status)
- Tool call metrics (count, duration, tool name)
- Database query metrics (duration, query type)
- Queue metrics (depth, processing time)

**Endpoint**: `GET /metrics` (Prometheus format)

### 2. Distributed Tracing (OpenTelemetry + Jaeger)

**Purpose**: Track request flow across services, identify bottlenecks

**Implementation**: `@opentelemetry/sdk-node` with auto-instrumentation

**Spans Created**:
- HTTP requests (gateway)
- Agent executions (agent runner)
- LLM API calls (provider integration)
- Tool executions (tool runner)
- Database queries (storage layer)

**Trace Context**: Propagated via W3C Trace Context headers

### 3. Structured Logging (Pino + Loki)

**Purpose**: Detailed event logs with trace correlation

**Implementation**: `pino` logger with trace context injection

**Log Levels**: trace, debug, info, warn, error, fatal

**Structured Fields**: traceId, spanId, userId, agentId, runId, toolName

### 4. Dashboards (Grafana)

**Purpose**: Visualize metrics, traces, and logs in unified interface

**Dashboards**:
- System Overview (request rate, error rate, latency)
- Agent Performance (execution time, success rate by agent)
- Tool Usage (call count, duration by tool)
- Database Performance (query duration, connection pool)

## Metrics Specification

### HTTP Metrics

```typescript
import { Counter, Histogram } from 'prom-client';

const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'path', 'status'],
});

const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'path', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
});

// In middleware
app.addHook('onResponse', (request, reply) => {
  const duration = reply.getResponseTime() / 1000;

  httpRequestsTotal.inc({
    method: request.method,
    path: request.routerPath,
    status: reply.statusCode,
  });

  httpRequestDuration.observe({
    method: request.method,
    path: request.routerPath,
    status: reply.statusCode,
  }, duration);
});
```

### Agent Execution Metrics

```typescript
const agentExecutionsTotal = new Counter({
  name: 'agent_executions_total',
  help: 'Total number of agent executions',
  labelNames: ['agent_id', 'status'],
});

const agentExecutionDuration = new Histogram({
  name: 'agent_execution_duration_seconds',
  help: 'Agent execution duration in seconds',
  labelNames: ['agent_id'],
  buckets: [1, 5, 10, 30, 60, 120, 300],
});

// In agent runner
const startTime = Date.now();

try {
  const result = await executeAgent(agent, input);
  agentExecutionsTotal.inc({ agent_id: agent.id, status: 'success' });
} catch (error) {
  agentExecutionsTotal.inc({ agent_id: agent.id, status: 'failed' });
} finally {
  const duration = (Date.now() - startTime) / 1000;
  agentExecutionDuration.observe({ agent_id: agent.id }, duration);
}
```

### Tool Call Metrics

```typescript
const toolCallsTotal = new Counter({
  name: 'tool_calls_total',
  help: 'Total number of tool calls',
  labelNames: ['tool_name', 'status'],
});

const toolCallDuration = new Histogram({
  name: 'tool_call_duration_seconds',
  help: 'Tool call duration in seconds',
  labelNames: ['tool_name'],
  buckets: [0.01, 0.1, 0.5, 1, 5, 10],
});
```

### Database Metrics

```typescript
const dbQueryDuration = new Histogram({
  name: 'db_query_duration_seconds',
  help: 'Database query duration in seconds',
  labelNames: ['operation'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5],
});
```

## Tracing Specification

### OpenTelemetry Setup

```typescript
// packages/observability/src/tracing.ts
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { JaegerExporter } from '@opentelemetry/exporter-jaeger';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';

export function initTracing(serviceName: string) {
  const sdk = new NodeSDK({
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: serviceName,
    }),
    traceExporter: new JaegerExporter({
      endpoint: process.env.JAEGER_ENDPOINT || 'http://localhost:14268/api/traces',
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-http': { enabled: true },
        '@opentelemetry/instrumentation-fastify': { enabled: true },
      }),
    ],
  });

  sdk.start();

  process.on('SIGTERM', () => {
    sdk.shutdown().then(() => console.log('Tracing terminated'));
  });
}
```

### Custom Spans

```typescript
import { trace } from '@opentelemetry/api';

const tracer = trace.getTracer('senclaw-agent-runner');

async function executeAgent(agent: Agent, input: string) {
  return tracer.startActiveSpan('agent.execute', async (span) => {
    span.setAttribute('agent.id', agent.id);
    span.setAttribute('agent.name', agent.name);

    try {
      const result = await runAgent(agent, input);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
      span.recordException(error);
      throw error;
    } finally {
      span.end();
    }
  });
}
```

### LLM Call Spans

```typescript
async function callLLM(provider: Provider, messages: Message[]) {
  return tracer.startActiveSpan('llm.call', async (span) => {
    span.setAttribute('llm.provider', provider.provider);
    span.setAttribute('llm.model', provider.model);
    span.setAttribute('llm.messages.count', messages.length);

    const startTime = Date.now();

    try {
      const response = await provider.complete(messages);

      span.setAttribute('llm.tokens.input', response.usage.inputTokens);
      span.setAttribute('llm.tokens.output', response.usage.outputTokens);
      span.setAttribute('llm.duration_ms', Date.now() - startTime);

      return response;
    } finally {
      span.end();
    }
  });
}
```

## Logging Specification

### Pino Logger with Trace Context

```typescript
// packages/observability/src/logger.ts
import pino from 'pino';
import { trace, context } from '@opentelemetry/api';

export function createLogger(serviceName: string) {
  return pino({
    name: serviceName,
    level: process.env.LOG_LEVEL || 'info',
    formatters: {
      level: (label) => ({ level: label }),
    },
    mixin() {
      const span = trace.getSpan(context.active());
      if (!span) return {};

      const spanContext = span.spanContext();
      return {
        traceId: spanContext.traceId,
        spanId: spanContext.spanId,
      };
    },
  });
}

// Usage
const logger = createLogger('senclaw-gateway');

logger.info({ agentId: 'agent-123', runId: 'run-456' }, 'Agent execution started');
```

### Log Sampling

For high-volume endpoints, sample logs:

```typescript
const shouldLog = Math.random() < 0.1; // 10% sampling

if (shouldLog) {
  logger.debug({ path: request.url }, 'Request received');
}
```

## Configuration

### Environment Variables

```bash
# Metrics
SENCLAW_METRICS_ENABLED=true

# Tracing
SENCLAW_TRACING_ENABLED=true
JAEGER_ENDPOINT=http://localhost:14268/api/traces

# Logging
LOG_LEVEL=info
SENCLAW_LOG_SAMPLING_RATE=0.1
```

## Grafana Dashboards

### System Overview Dashboard

**Panels**:
- Request Rate (requests/sec)
- Error Rate (%)
- P50/P95/P99 Latency
- Active Agents
- Active Runs

**Queries**:
```promql
# Request rate
rate(http_requests_total[5m])

# Error rate
rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m])

# P95 latency
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))
```

### Agent Performance Dashboard

**Panels**:
- Executions by Agent (bar chart)
- Success Rate by Agent (%)
- Execution Duration by Agent (heatmap)
- Failed Executions (table)

### Tool Usage Dashboard

**Panels**:
- Tool Calls by Tool (pie chart)
- Tool Call Duration (histogram)
- Tool Failure Rate (%)

## Testing

### Metrics Testing

```typescript
describe('Metrics', () => {
  it('increments request counter', async () => {
    const before = await getMetricValue('http_requests_total');

    await app.inject({ method: 'GET', url: '/api/v1/agents' });

    const after = await getMetricValue('http_requests_total');
    expect(after).toBeGreaterThan(before);
  });
});
```

### Tracing Testing

```typescript
describe('Tracing', () => {
  it('creates span for agent execution', async () => {
    const spans = [];
    const exporter = new InMemorySpanExporter();

    await executeAgent(agent, input);

    const exportedSpans = exporter.getFinishedSpans();
    expect(exportedSpans).toContainEqual(
      expect.objectContaining({ name: 'agent.execute' })
    );
  });
});
```

## Best Practices

1. **Use consistent label names** across metrics
2. **Keep cardinality low** (avoid high-cardinality labels like user IDs)
3. **Sample high-volume logs** to reduce storage costs
4. **Set appropriate histogram buckets** for latency metrics
5. **Propagate trace context** across all service boundaries
6. **Add custom spans** for critical operations (LLM calls, tool executions)
7. **Use structured logging** with consistent field names
8. **Monitor dashboard performance** (avoid expensive queries)
9. **Set up alerts** for critical metrics (error rate, latency)
10. **Document metrics** and their meanings
