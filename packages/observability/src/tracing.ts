import {
  type Attributes,
  type Context,
  type Span,
  SpanKind,
  SpanStatusCode,
  context,
  propagation,
  trace,
} from "@opentelemetry/api";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { NodeSDK } from "@opentelemetry/sdk-node";
import {
  BatchSpanProcessor,
  SimpleSpanProcessor,
  type SpanExporter,
} from "@opentelemetry/sdk-trace-base";

export type TraceContext = Context;
export type TracingSpan = Span;
export type TraceExporter = SpanExporter;
export type SpanKindName = "internal" | "server" | "client";

export interface TracingInitOptions {
  serviceName: string;
  enabled?: boolean;
  endpoint?: string;
  exporter?: SpanExporter;
  autoInstrumentations?: boolean;
}

export interface TracingHandle {
  enabled: boolean;
  serviceName: string;
  shutdown(): Promise<void>;
}

export interface SpanRunOptions {
  tracerName?: string;
  attributes?: Attributes;
  kind?: SpanKindName;
  parentContext?: TraceContext;
  setOkStatusOnSuccess?: boolean;
}

const headerGetter = {
  get(carrier: Record<string, string | string[] | undefined>, key: string) {
    const value = carrier[key.toLowerCase()] ?? carrier[key];
    if (Array.isArray(value)) {
      return value;
    }

    return value === undefined ? [] : [value];
  },
  keys(carrier: Record<string, string | string[] | undefined>) {
    return Object.keys(carrier);
  },
};

let activeTracingHandle: {
  sdk: NodeSDK;
  handle: TracingHandle;
} | null = null;

function resolveSpanKind(kind: SpanKindName | undefined): SpanKind {
  switch (kind) {
    case "server":
      return SpanKind.SERVER;
    case "client":
      return SpanKind.CLIENT;
    default:
      return SpanKind.INTERNAL;
  }
}

function normalizeHeaders(
  headers: Record<string, unknown>,
): Record<string, string | string[] | undefined> {
  const normalized: Record<string, string | string[] | undefined> = {};

  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === "string" || Array.isArray(value)) {
      normalized[key.toLowerCase()] = value;
    }
  }

  return normalized;
}

export async function shutdownTracing(): Promise<void> {
  if (!activeTracingHandle) {
    return;
  }

  const { sdk } = activeTracingHandle;
  activeTracingHandle = null;
  await sdk.shutdown();
}

export async function initializeTracing(
  options: TracingInitOptions,
): Promise<TracingHandle> {
  await shutdownTracing();

  if (!options.enabled) {
    return {
      enabled: false,
      serviceName: options.serviceName,
      shutdown: async () => {},
    };
  }

  const exporter =
    options.exporter ??
    new OTLPTraceExporter(
      options.endpoint ? { url: options.endpoint } : undefined,
    );

  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      "service.name": options.serviceName,
    }),
    spanProcessors: [
      options.exporter
        ? new SimpleSpanProcessor(exporter)
        : new BatchSpanProcessor(exporter),
    ],
    instrumentations:
      options.autoInstrumentations === false
        ? []
        : [getNodeAutoInstrumentations()],
  });

  await Promise.resolve(sdk.start());

  const handle: TracingHandle = {
    enabled: true,
    serviceName: options.serviceName,
    shutdown: async () => {
      if (activeTracingHandle?.handle === handle) {
        activeTracingHandle = null;
      }
      await sdk.shutdown();
    },
  };

  activeTracingHandle = { sdk, handle };
  return handle;
}

export function getTraceContextFields(): {
  traceId?: string;
  spanId?: string;
} {
  const activeSpan = trace.getSpan(context.active());
  if (!activeSpan) {
    return {};
  }

  const spanContext = activeSpan.spanContext();
  return {
    traceId: spanContext.traceId,
    spanId: spanContext.spanId,
  };
}

export function extractTraceContext(
  headers: Record<string, unknown>,
): TraceContext {
  return propagation.extract(
    context.active(),
    normalizeHeaders(headers),
    headerGetter,
  );
}

export function injectTraceContext(
  carrier: Record<string, string>,
  traceContext: TraceContext = context.active(),
): Record<string, string> {
  propagation.inject(traceContext, carrier);
  return carrier;
}

export function runWithContext<T>(traceContext: TraceContext, fn: () => T): T {
  return context.with(traceContext, fn);
}

export function startSpan(
  name: string,
  options: Omit<SpanRunOptions, "setOkStatusOnSuccess"> = {},
): { span: TracingSpan; traceContext: TraceContext } {
  const tracer = trace.getTracer(options.tracerName ?? "senclaw");
  const parentContext = options.parentContext ?? context.active();
  const span = tracer.startSpan(
    name,
    {
      kind: resolveSpanKind(options.kind),
      attributes: options.attributes,
    },
    parentContext,
  );

  return {
    span,
    traceContext: trace.setSpan(parentContext, span),
  };
}

export function setSpanOk(span: TracingSpan): void {
  span.setStatus({ code: SpanStatusCode.OK });
}

export function setSpanError(span: TracingSpan, error: unknown): void {
  if (error instanceof Error) {
    span.recordException(error);
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error.message,
    });
    return;
  }

  const message = typeof error === "string" ? error : String(error);
  span.setStatus({
    code: SpanStatusCode.ERROR,
    message,
  });
}

export async function withActiveSpan<T>(
  name: string,
  options: SpanRunOptions,
  fn: (span: TracingSpan) => Promise<T> | T,
): Promise<T> {
  const tracer = trace.getTracer(options.tracerName ?? "senclaw");
  const parentContext = options.parentContext ?? context.active();

  return tracer.startActiveSpan(
    name,
    {
      kind: resolveSpanKind(options.kind),
      attributes: options.attributes,
    },
    parentContext,
    async (span) => {
      try {
        const result = await fn(span);
        if (options.setOkStatusOnSuccess !== false) {
          setSpanOk(span);
        }
        return result;
      } catch (error) {
        setSpanError(span, error);
        throw error;
      } finally {
        span.end();
      }
    },
  );
}
