# Metrics Specification

## Overview

Metrics provide quantitative measurements of system behavior. Senclaw exposes metrics in Prometheus format for scraping and visualization.

## Metrics Endpoint

**Endpoint**: `GET /metrics`

**Format**: Prometheus text format

**Example Response**:
```
# HELP http_requests_total Total number of HTTP requests
# TYPE http_requests_total counter
http_requests_total{method="GET",path="/api/v1/agents",status="200"} 1523

# HELP http_request_duration_seconds HTTP request duration in seconds
# TYPE http_request_duration_seconds histogram
http_request_duration_seconds_bucket{method="GET",path="/api/v1/agents",status="200",le="0.01"} 1200
http_request_duration_seconds_bucket{method="GET",path="/api/v1/agents",status="200",le="0.05"} 1500
http_request_duration_seconds_bucket{method="GET",path="/api/v1/agents",status="200",le="+Inf"} 1523
http_request_duration_seconds_sum{method="GET",path="/api/v1/agents",status="200"} 15.23
http_request_duration_seconds_count{method="GET",path="/api/v1/agents",status="200"} 1523
```

## Metric Types

### Counter

Monotonically increasing value (resets on restart).

**Use cases**: Request counts, error counts, task submissions

```typescript
import { Counter } from 'prom-client';

const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'path', 'status'],
});

httpRequestsTotal.inc({ method: 'GET', path: '/api/v1/agents', status: '200' });
```

### Histogram

Distribution of values (latencies, sizes).

**Use cases**: Request duration, payload size, execution time

```typescript
import { Histogram } from 'prom-client';

const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'path'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
});

httpRequestDuration.observe({ method: 'GET', path: '/api/v1/agents' }, 0.045);
```

### Gauge

Current value that can go up or down.

**Use cases**: Active connections, queue depth, memory usage

```typescript
import { Gauge } from 'prom-client';

const activeRuns = new Gauge({
  name: 'active_runs',
  help: 'Number of currently active runs',
});

activeRuns.inc(); // Start run
activeRuns.dec(); // Complete run
```

## Standard Metrics

### HTTP Metrics

```typescript
// Request count
const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'path', 'status'],
});

// Request duration
const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'path', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
});

// Request size
const httpRequestSize = new Histogram({
  name: 'http_request_size_bytes',
  help: 'HTTP request size in bytes',
  labelNames: ['method', 'path'],
  buckets: [100, 1000, 10000, 100000, 1000000],
});

// Response size
const httpResponseSize = new Histogram({
  name: 'http_response_size_bytes',
  help: 'HTTP response size in bytes',
  labelNames: ['method', 'path', 'status'],
  buckets: [100, 1000, 10000, 100000, 1000000],
});
```

### Agent Metrics

```typescript
// Execution count
const agentExecutionsTotal = new Counter({
  name: 'agent_executions_total',
  help: 'Total number of agent executions',
  labelNames: ['agent_id', 'status'],
});

// Execution duration
const agentExecutionDuration = new Histogram({
  name: 'agent_execution_duration_seconds',
  help: 'Agent execution duration in seconds',
  labelNames: ['agent_id'],
  buckets: [1, 5, 10, 30, 60, 120, 300],
});

// Active runs
const activeRuns = new Gauge({
  name: 'agent_active_runs',
  help: 'Number of currently active agent runs',
  labelNames: ['agent_id'],
});
```

### LLM Metrics

```typescript
// LLM API calls
const llmCallsTotal = new Counter({
  name: 'llm_calls_total',
  help: 'Total number of LLM API calls',
  labelNames: ['provider', 'model', 'status'],
});

// LLM call duration
const llmCallDuration = new Histogram({
  name: 'llm_call_duration_seconds',
  help: 'LLM API call duration in seconds',
  labelNames: ['provider', 'model'],
  buckets: [0.5, 1, 2, 5, 10, 20, 30],
});

// Token usage
const llmTokensTotal = new Counter({
  name: 'llm_tokens_total',
  help: 'Total number of tokens used',
  labelNames: ['provider', 'model', 'type'], // type: input, output
});
```

### Tool Metrics

```typescript
// Tool calls
const toolCallsTotal = new Counter({
  name: 'tool_calls_total',
  help: 'Total number of tool calls',
  labelNames: ['tool_name', 'status'],
});

// Tool call duration
const toolCallDuration = new Histogram({
  name: 'tool_call_duration_seconds',
  help: 'Tool call duration in seconds',
  labelNames: ['tool_name'],
  buckets: [0.01, 0.1, 0.5, 1, 5, 10],
});
```

### Database Metrics

```typescript
// Query duration
const dbQueryDuration = new Histogram({
  name: 'db_query_duration_seconds',
  help: 'Database query duration in seconds',
  labelNames: ['operation'], // select, insert, update, delete
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5],
});

// Connection pool
const dbConnectionsActive = new Gauge({
  name: 'db_connections_active',
  help: 'Number of active database connections',
});
```

## Implementation

### Metrics Registry

```typescript
// packages/observability/src/metrics.ts
import { Registry, collectDefaultMetrics } from 'prom-client';

export const registry = new Registry();

// Collect default metrics (CPU, memory, etc.)
collectDefaultMetrics({ register: registry });

// Export metrics endpoint
export function getMetrics(): string {
  return registry.metrics();
}
```

### Fastify Integration

```typescript
// apps/gateway/src/server.ts
import { getMetrics } from '@senclaw/observability';

app.get('/metrics', async (request, reply) => {
  reply.type('text/plain');
  return getMetrics();
});
```

### Middleware Integration

```typescript
import { httpRequestsTotal, httpRequestDuration } from '@senclaw/observability';

app.addHook('onResponse', (request, reply) => {
  const duration = reply.getResponseTime() / 1000;

  httpRequestsTotal.inc({
    method: request.method,
    path: request.routerPath || request.url,
    status: String(reply.statusCode),
  });

  httpRequestDuration.observe({
    method: request.method,
    path: request.routerPath || request.url,
    status: String(reply.statusCode),
  }, duration);
});
```

## Prometheus Configuration

### Scrape Config

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'senclaw-gateway'
    static_configs:
      - targets: ['localhost:4100']
    metrics_path: '/metrics'
    scrape_interval: 15s

  - job_name: 'senclaw-scheduler'
    static_configs:
      - targets: ['localhost:4200']
    metrics_path: '/metrics'
    scrape_interval: 15s
```

## Queries

### Request Rate

```promql
rate(http_requests_total[5m])
```

### Error Rate

```promql
rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m])
```

### P95 Latency

```promql
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))
```

### Agent Success Rate

```promql
rate(agent_executions_total{status="success"}[5m]) / rate(agent_executions_total[5m])
```

### Token Usage by Model

```promql
sum by (model) (rate(llm_tokens_total[1h]))
```

## Best Practices

1. **Use consistent naming**: `<namespace>_<name>_<unit>`
2. **Keep cardinality low**: Avoid high-cardinality labels (user IDs, timestamps)
3. **Use appropriate buckets**: Match expected latency distribution
4. **Document metrics**: Add clear `help` text
5. **Avoid label explosion**: Limit label combinations
6. **Use counters for totals**: Not gauges
7. **Use histograms for latencies**: Not summaries
8. **Aggregate before querying**: Use `rate()`, `sum()`, etc.
