import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { context, trace } from "@opentelemetry/api";
import pino, {
  type DestinationStream,
  type LevelWithSilent,
  type Logger,
} from "pino";

const correlationStore = new AsyncLocalStorage<string>();
const LOG_LEVEL_PRIORITY: Record<LevelWithSilent, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
  silent: 70,
};

export function withCorrelationId<T>(id: string, fn: () => T): T {
  return correlationStore.run(id, fn);
}

export function getCorrelationId(): string | undefined {
  return correlationStore.getStore();
}

export function generateCorrelationId(): string {
  return randomUUID();
}

function hashString(input: string): number {
  let hash = 0x811c9dc5;
  for (const char of input) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function shouldSampleLog(key: string, rate: number): boolean {
  if (rate <= 0) {
    return false;
  }
  if (rate >= 1) {
    return true;
  }

  const normalized = hashString(key) / 0xffff_ffff;
  return normalized < rate;
}

export function resolveLogLevel(options: {
  defaultLevel: LevelWithSilent;
  endpoint?: string;
  userId?: string;
  endpointLevels?: Partial<Record<string, LevelWithSilent>>;
  userLevels?: Partial<Record<string, LevelWithSilent>>;
}): LevelWithSilent {
  return (
    (options.userId ? options.userLevels?.[options.userId] : undefined) ??
    (options.endpoint
      ? options.endpointLevels?.[options.endpoint]
      : undefined) ??
    options.defaultLevel
  );
}

export function mostVerboseLevel(
  left: LevelWithSilent,
  right: LevelWithSilent,
): LevelWithSilent {
  return LOG_LEVEL_PRIORITY[left] <= LOG_LEVEL_PRIORITY[right] ? left : right;
}

function getContextBindings(): Record<string, unknown> {
  const correlationId = correlationStore.getStore();
  const activeSpan = trace.getSpan(context.active());
  const spanContext = activeSpan?.spanContext();

  return {
    ...(correlationId ? { correlationId } : {}),
    ...(spanContext
      ? {
          traceId: spanContext.traceId,
          spanId: spanContext.spanId,
        }
      : {}),
  };
}

export function createLogger(
  serviceName: string,
  level: LevelWithSilent = "info",
  destination?: DestinationStream,
): Logger {
  const logger = pino(
    {
      level,
      formatters: {
        log(object) {
          return { ...getContextBindings(), ...object };
        },
      },
      base: { service: serviceName },
    },
    destination,
  );

  return logger as unknown as Logger;
}

export function createChildLogger(
  parent: Logger,
  bindings: Record<string, unknown> = {},
  options?: {
    level?: LevelWithSilent;
  },
): Logger {
  const childOptions: Parameters<Logger["child"]>[1] = options?.level
    ? { level: options.level }
    : undefined;
  return parent.child(bindings, childOptions) as unknown as Logger;
}
