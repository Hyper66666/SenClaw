## 1. Metrics Collection

- [x] 1.1 Add `prom-client` dependency to `@senclaw/observability`.
- [x] 1.2 Implement `MetricsRegistry` class: register counters, histograms, gauges.
- [x] 1.3 Add HTTP metrics: `http_requests_total`, `http_request_duration_seconds`.
- [x] 1.4 Add agent metrics: `agent_executions_total`, `agent_execution_duration_seconds`.
- [x] 1.5 Add tool metrics: `tool_calls_total`, `tool_call_duration_seconds`.
- [x] 1.6 Add database metrics: `db_query_duration_seconds`.
- [x] 1.7 Expose metrics endpoint: `GET /metrics` (Prometheus format).

## 2. Distributed Tracing

- [x] 2.1 Add `@opentelemetry/sdk-node` and `@opentelemetry/auto-instrumentations-node` dependencies.
- [x] 2.2 Initialize OpenTelemetry SDK in gateway and agent-runner.
- [x] 2.3 Configure trace exporter (Jaeger, Zipkin, or OTLP).
- [x] 2.4 Add custom spans for LLM calls, tool executions.
- [x] 2.5 Propagate trace context across HTTP requests (W3C Trace Context).

## 3. Enhanced Logging

- [x] 3.1 Add trace ID and span ID to Pino logger context.
- [x] 3.2 Add structured fields: userId, agentId, runId, toolName.
- [x] 3.3 Implement log sampling: sample 10% of requests for high-volume endpoints.
- [x] 3.4 Add log level filtering by endpoint or user.

## 4. Dashboards

- [x] 4.1 Create Grafana dashboard JSON: request rate, latency, error rate.
- [x] 4.2 Add dashboard for agent executions: success rate, duration distribution.
- [x] 4.3 Add dashboard for tool calls: call count by tool, failure rate.
- [x] 4.4 Document dashboard import instructions.

## 5. Configuration

- [x] 5.1 Add config options: `SENCLAW_METRICS_ENABLED`, `SENCLAW_TRACING_ENABLED`, `SENCLAW_TRACING_ENDPOINT`.
- [x] 5.2 Default: metrics enabled, tracing disabled (opt-in).

## 6. Testing

- [x] 6.1 Unit tests for metrics collection (increment counter, observe histogram).
- [x] 6.2 Integration test: make request, verify metrics endpoint returns data.
- [x] 6.3 Integration test: make request, verify trace exported (mock exporter).

## 7. Documentation

- [x] 7.1 Document metrics endpoint and available metrics.
- [x] 7.2 Document tracing configuration and supported exporters.
- [x] 7.3 Add Prometheus scrape config example.
- [x] 7.4 Add Grafana dashboard import instructions.

## 8. Verification

- [x] 8.1 Start gateway, verify `/metrics` endpoint returns Prometheus format.
- [x] 8.2 Make requests, verify metrics updated.
- [ ] 8.3 Enable tracing, verify traces exported to Jaeger/Zipkin.
- [ ] 8.4 Import Grafana dashboard, verify visualizations work.

