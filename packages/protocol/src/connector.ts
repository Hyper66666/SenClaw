import { z } from "zod";

// Connector types
export type ConnectorType = "webhook" | "queue" | "polling";

// Webhook config
export interface WebhookConfig {
  type: "webhook";
  secret: string;
  signatureHeader?: string;
  signatureAlgorithm?: string;
  allowedIPs?: string[];
}

// Queue config
export interface RabbitMqQueueConfig {
  type: "queue";
  provider: "rabbitmq";
  url: string;
  queue: string;
  exchange?: string;
  exchangeType?: "direct" | "fanout" | "topic" | "headers";
  routingKey?: string;
  prefetch?: number;
  durable?: boolean;
  requeueOnFailure?: boolean;
  deadLetterExchange?: string;
  deadLetterRoutingKey?: string;
}

export interface RedisQueueConfig {
  type: "queue";
  provider: "redis";
  url: string;
  stream: string;
  consumerGroup: string;
  consumerName?: string;
  batchSize?: number;
  blockMs?: number;
  requeueOnFailure?: boolean;
  deadLetterStream?: string;
}

export type QueueConfig = RabbitMqQueueConfig | RedisQueueConfig;

// Polling config
export interface PollingConfig {
  type: "polling";
  provider: "http";
  url: string;
  method?: string;
  headers?: Record<string, string>;
  interval: number; // seconds
  changeDetection?: "etag" | "content-hash" | "last-modified";
}

export type ConnectorConfig = WebhookConfig | QueueConfig | PollingConfig;

// Transformation
export interface TransformationFilter {
  field: string; // JSONPath expression
  operator:
    | "equals"
    | "not_equals"
    | "contains"
    | "not_contains"
    | "starts_with"
    | "ends_with"
    | "greater_than"
    | "less_than"
    | "regex";
  value: string | number | boolean;
}

export interface Transformation {
  inputTemplate?: string; // Handlebars template
  jsonPath?: string; // JSONPath extraction
  staticPrefix?: string;
  staticSuffix?: string;
  fallback?: string;
  filters?: TransformationFilter[];
}

// Connector entity
export interface Connector {
  id: string;
  name: string;
  type: ConnectorType;
  agentId: string;
  config: ConnectorConfig;
  transformation: Transformation;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  lastEventAt?: string;
}

export interface CreateConnector {
  name: string;
  type: ConnectorType;
  agentId: string;
  config: ConnectorConfig;
  transformation: Transformation;
}

export interface UpdateConnector {
  name?: string;
  config?: ConnectorConfig;
  transformation?: Transformation;
  enabled?: boolean;
}

// Connector event
export type ConnectorEventStatus =
  | "pending"
  | "submitted"
  | "failed"
  | "filtered";

export interface ConnectorEvent {
  id: string;
  connectorId: string;
  payload: string; // JSON string
  transformedInput?: string;
  status: ConnectorEventStatus;
  runId?: string;
  error?: string;
  receivedAt: string;
  processedAt?: string;
}

export interface CreateConnectorEvent {
  id: string;
  connectorId: string;
  payload: string;
  status: ConnectorEventStatus;
  receivedAt: string;
}

// Repository interfaces
export interface IConnectorRepository {
  create(data: CreateConnector): Promise<Connector>;
  get(id: string): Promise<Connector | undefined>;
  list(filters?: {
    type?: ConnectorType;
    enabled?: boolean;
    agentId?: string;
  }): Promise<Connector[]>;
  update(id: string, data: UpdateConnector): Promise<Connector | undefined>;
  delete(id: string): Promise<boolean>;
  updateLastEventAt(id: string, timestamp: string): Promise<void>;
}

export interface IConnectorEventRepository {
  create(data: CreateConnectorEvent): Promise<ConnectorEvent>;
  get(id: string): Promise<ConnectorEvent | undefined>;
  listByConnectorId(
    connectorId: string,
    filters?: {
      status?: ConnectorEventStatus;
      limit?: number;
      offset?: number;
    },
  ): Promise<ConnectorEvent[]>;
  update(
    id: string,
    data: {
      transformedInput?: string;
      status?: ConnectorEventStatus;
      runId?: string;
      error?: string;
      processedAt?: string;
    },
  ): Promise<void>;
}

// Zod schemas for validation
export const WebhookConfigSchema = z.object({
  type: z.literal("webhook"),
  secret: z.string().min(1),
  signatureHeader: z.string().optional(),
  signatureAlgorithm: z.string().optional(),
  allowedIPs: z.array(z.string()).optional(),
});

const RabbitMqQueueConfigSchema = z.object({
  type: z.literal("queue"),
  provider: z.literal("rabbitmq"),
  url: z.string().url(),
  queue: z.string().min(1),
  exchange: z.string().min(1).optional(),
  exchangeType: z.enum(["direct", "fanout", "topic", "headers"]).optional(),
  routingKey: z.string().optional(),
  prefetch: z.number().int().positive().optional(),
  durable: z.boolean().optional(),
  requeueOnFailure: z.boolean().optional(),
  deadLetterExchange: z.string().min(1).optional(),
  deadLetterRoutingKey: z.string().min(1).optional(),
});

const RedisQueueConfigSchema = z.object({
  type: z.literal("queue"),
  provider: z.literal("redis"),
  url: z.string().url(),
  stream: z.string().min(1),
  consumerGroup: z.string().min(1),
  consumerName: z.string().min(1).optional(),
  batchSize: z.number().int().positive().optional(),
  blockMs: z.number().int().nonnegative().optional(),
  requeueOnFailure: z.boolean().optional(),
  deadLetterStream: z.string().min(1).optional(),
});

export const QueueConfigSchema = z.discriminatedUnion("provider", [
  RabbitMqQueueConfigSchema,
  RedisQueueConfigSchema,
]);

export const PollingConfigSchema = z.object({
  type: z.literal("polling"),
  provider: z.literal("http"),
  url: z.string().url(),
  method: z.string().optional(),
  headers: z.record(z.string(), z.string()).optional(),
  interval: z.number().int().positive(),
  changeDetection: z.enum(["etag", "content-hash", "last-modified"]).optional(),
});

export const ConnectorConfigSchema = z.discriminatedUnion("type", [
  WebhookConfigSchema,
  QueueConfigSchema,
  PollingConfigSchema,
]);

export const TransformationFilterSchema = z.object({
  field: z.string(),
  operator: z.enum([
    "equals",
    "not_equals",
    "contains",
    "not_contains",
    "starts_with",
    "ends_with",
    "greater_than",
    "less_than",
    "regex",
  ]),
  value: z.union([z.string(), z.number(), z.boolean()]),
});

export const TransformationSchema = z.object({
  inputTemplate: z.string().optional(),
  jsonPath: z.string().optional(),
  staticPrefix: z.string().optional(),
  staticSuffix: z.string().optional(),
  fallback: z.string().optional(),
  filters: z.array(TransformationFilterSchema).optional(),
});

export const CreateConnectorSchema = z.object({
  name: z.string().min(1).max(255),
  type: z.enum(["webhook", "queue", "polling"]),
  agentId: z.string().uuid(),
  config: ConnectorConfigSchema,
  transformation: TransformationSchema,
});

export const UpdateConnectorSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  config: ConnectorConfigSchema.optional(),
  transformation: TransformationSchema.optional(),
  enabled: z.boolean().optional(),
});
