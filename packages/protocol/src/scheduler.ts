import { z } from "zod";
const TimestampSchema = z.string().min(1);
export interface ScheduledJob {
  id: string;
  agentId: string;
  name: string;
  cronExpression: string;
  input: string;
  enabled: boolean;
  allowConcurrent: boolean;
  timezone: string;
  maxRetries: number;
  createdAt: string;
  updatedAt: string;
  lastRunAt?: string;
  nextRunAt?: string;
}
export interface CreateScheduledJob {
  agentId: string;
  name: string;
  cronExpression: string;
  input: string;
  allowConcurrent?: boolean;
  timezone?: string;
  maxRetries?: number;
}
export interface UpdateScheduledJob {
  name?: string;
  cronExpression?: string;
  input?: string;
  enabled?: boolean;
  allowConcurrent?: boolean;
  timezone?: string;
  maxRetries?: number;
}
export type JobExecutionStatus =
  | "submitted"
  | "completed"
  | "failed"
  | "skipped";
export interface JobExecution {
  id: string;
  jobId: string;
  runId?: string;
  status: JobExecutionStatus;
  scheduledAt: string;
  executedAt?: string;
  error?: string;
}
export interface CreateJobExecution {
  jobId: string;
  runId?: string;
  status: JobExecutionStatus;
  scheduledAt: Date;
  executedAt?: Date;
  error?: string;
}
export interface IJobRepository {
  create(data: CreateScheduledJob): Promise<ScheduledJob>;
  get(id: string): Promise<ScheduledJob | undefined>;
  list(filters?: {
    agentId?: string;
    enabled?: boolean;
  }): Promise<ScheduledJob[]>;
  update(
    id: string,
    data: UpdateScheduledJob,
  ): Promise<ScheduledJob | undefined>;
  delete(id: string): Promise<boolean>;
  disable(id: string): Promise<void>;
  findDueJobs(now: Date): Promise<ScheduledJob[]>;
  updateNextRun(id: string, lastRunAt: Date, nextRunAt: Date): Promise<void>;
}
export interface IExecutionRepository {
  create(data: CreateJobExecution): Promise<JobExecution>;
  get(id: string): Promise<JobExecution | undefined>;
  listByJobId(
    jobId: string,
    limit?: number,
    offset?: number,
  ): Promise<JobExecution[]>;
  updateStatus(
    id: string,
    status: JobExecutionStatus,
    runId?: string,
    error?: string,
  ): Promise<void>;
  hasRunningExecution(jobId: string): Promise<boolean>;
  countRecentFailures(jobId: string, limit: number): Promise<number>;
}
export const ScheduledJobSchema = z.object({
  id: z.string().uuid(),
  agentId: z.string().uuid(),
  name: z.string().min(1).max(255),
  cronExpression: z.string().min(1),
  input: z.string(),
  enabled: z.boolean(),
  allowConcurrent: z.boolean(),
  timezone: z.string().min(1),
  maxRetries: z.number().int().min(0).max(10),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
  lastRunAt: TimestampSchema.optional(),
  nextRunAt: TimestampSchema.optional(),
});
export const CreateScheduledJobSchema = z.object({
  agentId: z.string().uuid(),
  name: z.string().min(1).max(255),
  cronExpression: z.string().min(1),
  input: z.string(),
  allowConcurrent: z.boolean().optional(),
  timezone: z.string().optional(),
  maxRetries: z.number().int().min(0).max(10).optional(),
});
export const UpdateScheduledJobSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  cronExpression: z.string().min(1).optional(),
  input: z.string().optional(),
  enabled: z.boolean().optional(),
  allowConcurrent: z.boolean().optional(),
  timezone: z.string().optional(),
  maxRetries: z.number().int().min(0).max(10).optional(),
});
