# Dashboards Specification

## Overview

Grafana dashboards provide visual insights into Senclaw's performance, health, and usage patterns. This spec defines standard dashboards for monitoring the system.

## Dashboard List

1. **System Overview** - High-level health and performance
2. **Agent Performance** - Agent execution metrics
3. **LLM Usage** - Token usage and costs
4. **Tool Analytics** - Tool call patterns
5. **Database Performance** - Query performance and connections

## 1. System Overview Dashboard

### Purpose
Monitor overall system health, request rates, error rates, and latencies.

### Panels

#### Request Rate
**Type**: Graph (time series)

**Query**:
```promql
sum(rate(http_requests_total[5m])) by (status)
```

**Description**: Requests per second, grouped by status code

---

#### Error Rate
**Type**: Stat (single value with sparkline)

**Query**:
```promql
sum(rate(http_requests_total{status=~"5.."}[5m])) / sum(rate(http_requests_total[5m])) * 100
```

**Unit**: Percent

**Thresholds**:
- Green: < 1%
- Yellow: 1-5%
- Red: > 5%

---

#### P50/P95/P99 Latency
**Type**: Graph (time series)

**Queries**:
```promql
# P50
histogram_quantile(0.50, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))

# P95
histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))

# P99
histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))
```

**Unit**: Seconds

---

#### Active Runs
**Type**: Gauge

**Query**:
```promql
sum(agent_active_runs)
```

**Description**: Number of currently executing agent runs

---

#### Request Heatmap
**Type**: Heatmap

**Query**:
```promql
sum(rate(http_request_duration_seconds_bucket[5m])) by (le)
```

**Description**: Distribution of request latencies over time

---

#### Top Endpoints by Request Count
**Type**: Bar chart

**Query**:
```promql
topk(10, sum(rate(http_requests_total[1h])) by (path))
```

**Description**: Most frequently called endpoints

---

#### Top Endpoints by Error Rate
**Type**: Table

**Query**:
```promql
topk(10,
  sum(rate(http_requests_total{status=~"5.."}[1h])) by (path) /
  sum(rate(http_requests_total[1h])) by (path)
)
```

**Columns**: Endpoint, Error Rate (%)

---

## 2. Agent Performance Dashboard

### Purpose
Analyze agent execution patterns, success rates, and performance.

### Panels

#### Executions by Agent
**Type**: Bar chart

**Query**:
```promql
sum(increase(agent_executions_total[1h])) by (agent_id)
```

**Description**: Total executions per agent in the last hour

---

#### Success Rate by Agent
**Type**: Table

**Query**:
```promql
sum(rate(agent_executions_total{status="success"}[1h])) by (agent_id) /
sum(rate(agent_executions_total[1h])) by (agent_id) * 100
```

**Columns**: Agent ID, Success Rate (%)

**Sort**: By success rate (ascending) to highlight problematic agents

---

#### Execution Duration by Agent
**Type**: Heatmap

**Query**:
```promql
sum(rate(agent_execution_duration_seconds_bucket[5m])) by (agent_id, le)
```

**Description**: Distribution of execution times per agent

---

#### Failed Executions
**Type**: Table

**Query**:
```promql
topk(20, sum(increase(agent_executions_total{status="failed"}[1h])) by (agent_id))
```

**Columns**: Agent ID, Failed Count

**Description**: Agents with most failures in the last hour

---

#### Average Execution Time
**Type**: Stat

**Query**:
```promql
avg(rate(agent_execution_duration_seconds_sum[5m]) / rate(agent_execution_duration_seconds_count[5m]))
```

**Unit**: Seconds

---

#### Execution Time Percentiles by Agent
**Type**: Graph (time series)

**Query**:
```promql
histogram_quantile(0.95, sum(rate(agent_execution_duration_seconds_bucket[5m])) by (agent_id, le))
```

**Description**: P95 execution time per agent

---

## 3. LLM Usage Dashboard

### Purpose
Track LLM API usage, token consumption, and estimated costs.

### Panels

#### Total Tokens Used
**Type**: Stat

**Query**:
```promql
sum(increase(llm_tokens_total[1h]))
```

**Description**: Total tokens consumed in the last hour

---

#### Tokens by Model
**Type**: Pie chart

**Query**:
```promql
sum(increase(llm_tokens_total[1h])) by (model)
```

**Description**: Token distribution across models

---

#### Token Usage Over Time
**Type**: Graph (time series)

**Query**:
```promql
sum(rate(llm_tokens_total[5m])) by (type)
```

**Legend**: Input Tokens, Output Tokens

---

#### LLM Call Success Rate
**Type**: Stat

**Query**:
```promql
sum(rate(llm_calls_total{status="success"}[5m])) /
sum(rate(llm_calls_total[5m])) * 100
```

**Unit**: Percent

**Thresholds**:
- Green: > 99%
- Yellow: 95-99%
- Red: < 95%

---

#### LLM Call Duration
**Type**: Graph (time series)

**Query**:
```promql
histogram_quantile(0.95, sum(rate(llm_call_duration_seconds_bucket[5m])) by (provider, le))
```

**Description**: P95 latency by provider

---

#### Estimated Cost (Hourly)
**Type**: Stat

**Query** (requires recording rules):
```promql
sum(
  rate(llm_tokens_total{type="input"}[1h]) * 0.00001 +  # $0.01 per 1K input tokens
  rate(llm_tokens_total{type="output"}[1h]) * 0.00003   # $0.03 per 1K output tokens
) * 3600
```

**Unit**: USD

**Description**: Estimated hourly cost based on token usage

---

#### Top Agents by Token Usage
**Type**: Table

**Query** (requires custom metric with agent_id label):
```promql
topk(10, sum(increase(llm_tokens_total[1h])) by (agent_id))
```

**Columns**: Agent ID, Total Tokens

---

## 4. Tool Analytics Dashboard

### Purpose
Understand tool usage patterns and performance.

### Panels

#### Tool Calls by Tool
**Type**: Pie chart

**Query**:
```promql
sum(increase(tool_calls_total[1h])) by (tool_name)
```

**Description**: Distribution of tool calls

---

#### Tool Call Duration
**Type**: Histogram

**Query**:
```promql
sum(rate(tool_call_duration_seconds_bucket[5m])) by (tool_name, le)
```

**Description**: Latency distribution per tool

---

#### Tool Failure Rate
**Type**: Table

**Query**:
```promql
sum(rate(tool_calls_total{status="failed"}[1h])) by (tool_name) /
sum(rate(tool_calls_total[1h])) by (tool_name) * 100
```

**Columns**: Tool Name, Failure Rate (%)

**Sort**: By failure rate (descending)

---

#### Tool Call Rate Over Time
**Type**: Graph (time series)

**Query**:
```promql
sum(rate(tool_calls_total[5m])) by (tool_name)
```

**Description**: Tool calls per second by tool

---

#### Slowest Tools (P95)
**Type**: Bar chart

**Query**:
```promql
topk(10, histogram_quantile(0.95, sum(rate(tool_call_duration_seconds_bucket[5m])) by (tool_name, le)))
```

**Description**: Tools with highest P95 latency

---

## 5. Database Performance Dashboard

### Purpose
Monitor database query performance and connection health.

### Panels

#### Query Duration by Operation
**Type**: Graph (time series)

**Query**:
```promql
histogram_quantile(0.95, sum(rate(db_query_duration_seconds_bucket[5m])) by (operation, le))
```

**Legend**: SELECT, INSERT, UPDATE, DELETE

---

#### Active Connections
**Type**: Gauge

**Query**:
```promql
db_connections_active
```

**Thresholds**:
- Green: < 80% of max
- Yellow: 80-95% of max
- Red: > 95% of max

---

#### Slow Queries (> 100ms)
**Type**: Stat

**Query**:
```promql
sum(rate(db_query_duration_seconds_bucket{le="0.1"}[5m])) /
sum(rate(db_query_duration_seconds_count[5m])) * 100
```

**Unit**: Percent

**Description**: Percentage of queries slower than 100ms

---

#### Query Rate by Operation
**Type**: Graph (time series)

**Query**:
```promql
sum(rate(db_query_duration_seconds_count[5m])) by (operation)
```

**Description**: Queries per second by operation type

---

## Dashboard JSON Export

### System Overview Dashboard

```json
{
  "dashboard": {
    "title": "Senclaw - System Overview",
    "tags": ["senclaw", "overview"],
    "timezone": "browser",
    "panels": [
      {
        "id": 1,
        "title": "Request Rate",
        "type": "graph",
        "targets": [
          {
            "expr": "sum(rate(http_requests_total[5m])) by (status)"
          }
        ]
      },
      {
        "id": 2,
        "title": "Error Rate",
        "type": "stat",
        "targets": [
          {
            "expr": "sum(rate(http_requests_total{status=~\"5..\"}[5m])) / sum(rate(http_requests_total[5m])) * 100"
          }
        ],
        "fieldConfig": {
          "defaults": {
            "unit": "percent",
            "thresholds": {
              "steps": [
                { "value": 0, "color": "green" },
                { "value": 1, "color": "yellow" },
                { "value": 5, "color": "red" }
              ]
            }
          }
        }
      }
    ]
  }
}
```

## Alerting Rules

### High Error Rate

```yaml
groups:
  - name: senclaw_alerts
    interval: 30s
    rules:
      - alert: HighErrorRate
        expr: |
          sum(rate(http_requests_total{status=~"5.."}[5m])) /
          sum(rate(http_requests_total[5m])) > 0.05
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "High error rate detected"
          description: "Error rate is {{ $value | humanizePercentage }}"
```

### High Latency

```yaml
- alert: HighLatency
  expr: |
    histogram_quantile(0.95,
      sum(rate(http_request_duration_seconds_bucket[5m])) by (le)
    ) > 2
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "High P95 latency detected"
    description: "P95 latency is {{ $value }}s"
```

### Agent Failures

```yaml
- alert: AgentFailureSpike
  expr: |
    sum(rate(agent_executions_total{status="failed"}[5m])) by (agent_id) > 0.1
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "Agent {{ $labels.agent_id }} has high failure rate"
    description: "Failure rate is {{ $value }} failures/sec"
```

## Best Practices

1. **Use consistent time ranges** across related panels (e.g., all 5m)
2. **Set appropriate thresholds** for stat panels (green/yellow/red)
3. **Add descriptions** to panels for clarity
4. **Use variables** for dynamic filtering (e.g., agent_id, environment)
5. **Group related panels** in rows
6. **Export dashboards as JSON** for version control
7. **Test queries** in Prometheus before adding to dashboard
8. **Set up alerts** for critical metrics
9. **Use templating** for multi-environment dashboards
10. **Document dashboard purpose** in description field
