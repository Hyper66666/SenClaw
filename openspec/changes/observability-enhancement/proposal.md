# Observability Enhancement

## Problem Statement

Current observability is limited:
- **No metrics**: Cannot track request rates, latencies, error rates
- **No tracing**: Cannot follow requests across services
- **Basic logging**: No structured fields, no log aggregation
- **No dashboards**: Cannot visualize system health over time

## Proposed Solution

Enhance observability with:
1. **Metrics**: Prometheus-compatible metrics endpoint
2. **Distributed Tracing**: OpenTelemetry integration
3. **Structured Logging**: Add context fields (trace ID, span ID, user ID)
4. **Dashboards**: Grafana dashboards for key metrics

### Core Capabilities

- **Metrics Collection**
  - Request count, latency (p50, p95, p99)
  - Agent execution duration, tool call count
  - Database query duration
  - Error rates by endpoint

- **Distributed Tracing**
  - Trace requests across gateway → agent-runner → tool-runner
  - Span for each LLM call, tool execution
  - Export to Jaeger or Zipkin

- **Enhanced Logging**
  - Add trace ID to all log lines
  - Structured fields: userId, agentId, runId
  - Log sampling for high-volume endpoints

### Technology Stack

- **Metrics**: `prom-client` (Prometheus client)
- **Tracing**: `@opentelemetry/sdk-node`
- **Logging**: Enhance existing Pino logger

## Dependencies

- Existing `@senclaw/observability` package

## Timeline: 5-7 days
