# Tracing Specification

## Overview

Distributed tracing tracks requests as they flow through multiple services, helping identify bottlenecks and debug issues. Senclaw uses OpenTelemetry for instrumentation and Jaeger for trace storage/visualization.

## Architecture

```
Request → Gateway → Agent Runner → LLM Provider
   │         │           │              │
   └─────────┴───────────┴──────────────┘
              Trace Context
```

Each service creates spans that are linked by trace context, forming a complete trace.

## Trace Context Propagation

### W3C Trace Context Headers

```
traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
             │  │                                │                │
             │  └─ Trace ID (128-bit)           └─ Span ID       └─ Flags
             └─ Version
```

### Propagation Flow

```typescript
// Gateway receives request
const traceParent = request.headers['traceparent'];

// Gateway calls Agent Runner
await fetch('http://agent-runner/execute', {
  headers: {
    'traceparent': traceParent, // Propagate trace context
  },
});

// Agent Runner calls LLM
await fetch('https://api.openai.com/v1/chat/completions', {
  headers: {
    'traceparent': traceParent, // Propagate to external service
  },
});
```

## OpenTelemetry Setup

### SDK Initialization

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
      [SemanticResourceAttributes.SERVICE_VERSION]: process.env.VERSION || '1.0.0',
    }),
    traceExporter: new JaegerExporter({
      endpoint: process.env.JAEGER_ENDPOINT || 'http://localhost:14268/api/traces',
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-http': { enabled: true },
        '@opentelemetry/instrumentation-fastify': { enabled: true },
        '@opentelemetry/instrumentation-fetch': { enabled: true },
      }),
    ],
  });

  sdk.start();

  process.on('SIGTERM', () => {
    sdk.shutdown()
      .then(() => console.log('Tracing terminated'))
      .catch((error) => console.error('Error shutting down tracing', error));
  });

  return sdk;
}
```

### Service Initialization

```typescript
// apps/gateway/src/index.ts
import { initTracing } from '@senclaw/observability';

initTracing('senclaw-gateway');

// Start server
app.listen({ port: 4100 });
```

## Auto-Instrumentation

OpenTelemetry automatically instruments:
- HTTP requests (incoming and outgoing)
- Fastify routes
- Fetch API calls
- Database queries (with appropriate plugins)

No manual span creation needed for these.

## Custom Spans

### Creating Spans

```typescript
import { trace } from '@opentelemetry/api';

const tracer = trace.getTracer('senclaw-agent-runner');

async function executeAgent(agent: Agent, input: string) {
  return tracer.startActiveSpan('agent.execute', async (span) => {
    // Add attributes
    span.setAttribute('agent.id', agent.id);
    span.setAttribute('agent.name', agent.name);
    span.setAttribute('input.length', input.length);

    try {
      const result = await runAgent(agent, input);

      // Mark success
      span.setStatus({ code: SpanStatusCode.OK });

      return result;
    } catch (error) {
      // Mark error
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message
      });
      span.recordException(error);

      throw error;
    } finally {
      span.end();
    }
  });
}
```

### Nested Spans

```typescript
async function executeAgent(agent: Agent, input: string) {
  return tracer.startActiveSpan('agent.execute', async (parentSpan) => {
    parentSpan.setAttribute('agent.id', agent.id);

    // Child span: LLM call
    const response = await tracer.startActiveSpan('llm.call', async (childSpan) => {
      childSpan.setAttribute('llm.provider', agent.provider.provider);
      childSpan.setAttribute('llm.model', agent.provider.model);

      const result = await callLLM(agent.provider, messages);

      childSpan.setAttribute('llm.tokens.input', result.usage.inputTokens);
      childSpan.setAttribute('llm.tokens.output', result.usage.outputTokens);
      childSpan.end();

      return result;
    });

    parentSpan.end();
    return response;
  });
}
```

## Span Attributes

### Standard Attributes

Use semantic conventions from OpenTelemetry:

```typescript
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';

span.setAttribute(SemanticAttributes.HTTP_METHOD, 'POST');
span.setAttribute(SemanticAttributes.HTTP_URL, 'https://api.openai.com/v1/chat/completions');
span.setAttribute(SemanticAttributes.HTTP_STATUS_CODE, 200);
```

### Custom Attributes

```typescript
// Agent attributes
span.setAttribute('agent.id', agent.id);
span.setAttribute('agent.name', agent.name);
span.setAttribute('agent.provider', agent.provider.provider);
span.setAttribute('agent.model', agent.provider.model);

// Run attributes
span.setAttribute('run.id', run.id);
span.setAttribute('run.status', run.status);

// Tool attributes
span.setAttribute('tool.name', tool.name);
span.setAttribute('tool.duration_ms', duration);

// LLM attributes
span.setAttribute('llm.tokens.input', usage.inputTokens);
span.setAttribute('llm.tokens.output', usage.outputTokens);
span.setAttribute('llm.finish_reason', response.finishReason);
```

## Span Events

Record significant events within a span:

```typescript
span.addEvent('tool.started', {
  'tool.name': 'web_search',
  'tool.args': JSON.stringify(args),
});

// ... execute tool ...

span.addEvent('tool.completed', {
  'tool.result_size': result.length,
});
```

## Error Recording

```typescript
try {
  const result = await callLLM(provider, messages);
} catch (error) {
  span.recordException(error);
  span.setStatus({
    code: SpanStatusCode.ERROR,
    message: error.message
  });
  throw error;
}
```

## Sampling

### Always-On Sampler (Development)

```typescript
import { AlwaysOnSampler } from '@opentelemetry/sdk-trace-base';

const sdk = new NodeSDK({
  sampler: new AlwaysOnSampler(),
  // ...
});
```

### Probability Sampler (Production)

Sample 10% of traces:

```typescript
import { TraceIdRatioBasedSampler } from '@opentelemetry/sdk-trace-base';

const sdk = new NodeSDK({
  sampler: new TraceIdRatioBasedSampler(0.1),
  // ...
});
```

### Parent-Based Sampler

Respect parent's sampling decision:

```typescript
import { ParentBasedSampler, AlwaysOnSampler } from '@opentelemetry/sdk-trace-base';

const sdk = new NodeSDK({
  sampler: new ParentBasedSampler({
    root: new TraceIdRatioBasedSampler(0.1),
  }),
  // ...
});
```

## Jaeger Configuration

### Docker Compose

```yaml
services:
  jaeger:
    image: jaegertracing/all-in-one:latest
    ports:
      - "16686:16686"  # Jaeger UI
      - "14268:14268"  # Jaeger collector HTTP
      - "14250:14250"  # Jaeger collector gRPC
    environment:
      - COLLECTOR_OTLP_ENABLED=true
```

### Environment Variables

```bash
# Jaeger endpoint
JAEGER_ENDPOINT=http://localhost:14268/api/traces

# Sampling rate (0.0 to 1.0)
OTEL_TRACES_SAMPLER=traceidratio
OTEL_TRACES_SAMPLER_ARG=0.1
```

## Trace Visualization

### Jaeger UI

Access at `http://localhost:16686`

**Features**:
- Search traces by service, operation, tags
- View trace timeline (waterfall)
- Analyze span duration
- Compare traces
- View span attributes and events

### Example Trace

```
senclaw-gateway: POST /api/v1/tasks [200ms]
  └─ senclaw-agent-runner: agent.execute [180ms]
      ├─ llm.call [150ms]
      │   └─ HTTP POST https://api.openai.com/v1/chat/completions [145ms]
      └─ tool.execute [20ms]
          └─ web_search [18ms]
```

## Integration with Logs

### Inject Trace Context into Logs

```typescript
import { trace, context } from '@opentelemetry/api';
import pino from 'pino';

const logger = pino({
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

// Logs will include traceId and spanId
logger.info({ agentId: 'agent-123' }, 'Agent execution started');
// Output: {"level":"info","traceId":"4bf92f3577b34da6a3ce929d0e0e4736","spanId":"00f067aa0ba902b7","agentId":"agent-123","msg":"Agent execution started"}
```

### Correlate Logs with Traces

In Grafana, click trace ID in logs to jump to Jaeger trace.

## Testing

### In-Memory Exporter

```typescript
import { InMemorySpanExporter } from '@opentelemetry/sdk-trace-base';

const exporter = new InMemorySpanExporter();

const sdk = new NodeSDK({
  traceExporter: exporter,
  // ...
});

// After test
const spans = exporter.getFinishedSpans();
expect(spans).toContainEqual(
  expect.objectContaining({
    name: 'agent.execute',
    attributes: expect.objectContaining({
      'agent.id': 'agent-123',
    }),
  })
);
```

## Best Practices

1. **Use semantic conventions** for standard attributes
2. **Keep span names stable** (no IDs in span names)
3. **Add meaningful attributes** (agent ID, tool name, etc.)
4. **Record exceptions** with `span.recordException()`
5. **Set span status** (OK, ERROR)
6. **Use parent-based sampling** to maintain trace completeness
7. **Propagate context** across all service boundaries
8. **Add events** for significant milestones
9. **Keep attribute cardinality low** (avoid unique values)
10. **Test with in-memory exporter** in unit tests
