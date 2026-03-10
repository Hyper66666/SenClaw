# Observability

## Metrics Endpoint

Senclaw exposes Prometheus-compatible metrics from the gateway at `GET /metrics`.

- Authentication: not required
- Content type: Prometheus text format
- Default state: enabled
- Disable with: `SENCLAW_METRICS_ENABLED=false`

## Available Metrics

The current implementation exports these application metrics:

- `http_requests_total`
  - Labels: `method`, `path`, `status`
- `http_request_duration_seconds`
  - Labels: `method`, `path`, `status`
- `agent_executions_total`
  - Labels: `agent_id`, `status`
- `agent_execution_duration_seconds`
  - Labels: `agent_id`
- `tool_calls_total`
  - Labels: `tool_name`, `status`
- `tool_call_duration_seconds`
  - Labels: `tool_name`
- `db_query_duration_seconds`
  - Labels: `operation`

## Configuration

Environment variables:

```bash
SENCLAW_METRICS_ENABLED=true
SENCLAW_TRACING_ENABLED=false
SENCLAW_TRACING_ENDPOINT=http://localhost:4318/v1/traces
SENCLAW_LOG_SAMPLING_RATE=0.1
SENCLAW_LOG_DEBUG_ENDPOINTS=/health,/metrics
SENCLAW_LOG_DEBUG_USERS=system
```

Tracing is opt-in. When `SENCLAW_TRACING_ENABLED=true`, Senclaw initializes OpenTelemetry in the gateway and exports spans with the OTLP HTTP exporter to `SENCLAW_TRACING_ENDPOINT`.

Supported exporter modes:

- OTLP HTTP directly to an OpenTelemetry collector
- Jaeger all-in-one through OTLP when `COLLECTOR_OTLP_ENABLED=true`
- Custom in-process exporters for tests via `createServer({ tracingExporter })`

The current runtime wiring creates request spans in the gateway plus custom spans for:

- `agent.execute`
- `llm.call`
- `tool.execute`

Incoming `traceparent` headers are extracted and preserved so the exported request span stays on the caller's trace.

## Logging

Structured JSON logs include these fields when present:

- `traceId`
- `spanId`
- `correlationId`
- `userId`
- `agentId`
- `runId`
- `toolName`

High-volume endpoints (`/health`, `/metrics`) are sampled by `SENCLAW_LOG_SAMPLING_RATE`. You can force verbose request logging for selected endpoints or users with `SENCLAW_LOG_DEBUG_ENDPOINTS` and `SENCLAW_LOG_DEBUG_USERS`.

## Tracing Example

Enable tracing locally and send one request with an upstream trace:

```bash
set SENCLAW_TRACING_ENABLED=true
set SENCLAW_TRACING_ENDPOINT=http://localhost:4318/v1/traces
curl -H "traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01" http://localhost:4100/health
```

With Jaeger all-in-one, point an OTLP-enabled collector at `http://localhost:4318/v1/traces` and open `http://localhost:16686`.

## Prometheus Scrape Example

```yaml
scrape_configs:
  - job_name: "senclaw-gateway"
    static_configs:
      - targets: ["localhost:4100"]
    metrics_path: /metrics
    scrape_interval: 15s
```

## Example Checks

After a health request and one authenticated API request, `/metrics` should contain lines similar to:

```text
# HELP http_requests_total Total number of HTTP requests.
http_requests_total{method="GET",path="/health",status="200"} 1
```

```text
# HELP db_query_duration_seconds Database query duration in seconds.
db_query_duration_seconds_bucket{le="0.001",operation="select"} 3
```

## Grafana Dashboards

Version-controlled dashboard JSON lives in:

- `ops/observability/grafana/system-overview.json`
- `ops/observability/grafana/agent-performance.json`
- `ops/observability/grafana/tool-analytics.json`

Import steps:

1. Open Grafana and navigate to `Dashboards` -> `New` -> `Import`.
2. Upload one of the JSON files above.
3. Select your Prometheus datasource.
4. Save the dashboard.

The dashboards assume the metric names documented in this file and will work against the gateway `/metrics` endpoint once Prometheus is scraping it.
