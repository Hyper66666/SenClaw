import { randomUUID } from "node:crypto";
import type {
  CreateJobExecution,
  CreateScheduledJob,
  IExecutionRepository,
  IJobRepository,
  JobExecution,
  JobExecutionStatus,
  ScheduledJob,
  UpdateScheduledJob,
} from "@senclaw/protocol";
import { calculateNextRun } from "@senclaw/scheduler";

export class InMemoryJobRepository implements IJobRepository {
  private jobs = new Map<string, ScheduledJob>();

  async create(data: CreateScheduledJob): Promise<ScheduledJob> {
    const now = new Date().toISOString();
    const nextRunAt = calculateNextRun(
      data.cronExpression,
      data.timezone ?? "UTC",
    );

    const job: ScheduledJob = {
      id: randomUUID(),
      agentId: data.agentId,
      name: data.name,
      cronExpression: data.cronExpression,
      input: data.input,
      enabled: true,
      allowConcurrent: data.allowConcurrent ?? false,
      timezone: data.timezone ?? "UTC",
      maxRetries: data.maxRetries ?? 0,
      createdAt: now,
      updatedAt: now,
      nextRunAt,
    };

    this.jobs.set(job.id, job);
    return job;
  }

  async get(id: string): Promise<ScheduledJob | undefined> {
    return this.jobs.get(id);
  }

  async list(filters?: {
    agentId?: string;
    enabled?: boolean;
  }): Promise<ScheduledJob[]> {
    let jobs = Array.from(this.jobs.values());

    if (filters?.agentId) {
      jobs = jobs.filter((j) => j.agentId === filters.agentId);
    }
    if (filters?.enabled !== undefined) {
      jobs = jobs.filter((j) => j.enabled === filters.enabled);
    }

    return jobs;
  }

  async update(
    id: string,
    data: UpdateScheduledJob,
  ): Promise<ScheduledJob | undefined> {
    const job = this.jobs.get(id);
    if (!job) return undefined;

    const updated: ScheduledJob = {
      ...job,
      ...data,
      updatedAt: new Date().toISOString(),
    };

    if (data.cronExpression !== undefined) {
      updated.nextRunAt = calculateNextRun(
        data.cronExpression,
        data.timezone ?? job.timezone,
      );
    }

    this.jobs.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    return this.jobs.delete(id);
  }

  async disable(id: string): Promise<void> {
    const job = this.jobs.get(id);
    if (job) {
      job.enabled = false;
      job.updatedAt = new Date().toISOString();
    }
  }

  async findDueJobs(now: Date): Promise<ScheduledJob[]> {
    const nowStr = now.toISOString();
    return Array.from(this.jobs.values()).filter(
      (job) => job.enabled && job.nextRunAt && job.nextRunAt <= nowStr,
    );
  }

  async updateNextRun(
    id: string,
    lastRunAt: Date,
    nextRunAt: Date,
  ): Promise<void> {
    const job = this.jobs.get(id);
    if (job) {
      job.lastRunAt = lastRunAt.toISOString();
      job.nextRunAt = nextRunAt.toISOString();
      job.updatedAt = new Date().toISOString();
    }
  }
}

export class InMemoryExecutionRepository implements IExecutionRepository {
  private executions = new Map<string, JobExecution>();

  async create(data: CreateJobExecution): Promise<JobExecution> {
    const execution: JobExecution = {
      id: randomUUID(),
      jobId: data.jobId,
      runId: data.runId,
      status: data.status,
      scheduledAt: data.scheduledAt.toISOString(),
      executedAt: data.executedAt?.toISOString(),
      error: data.error,
    };

    this.executions.set(execution.id, execution);
    return execution;
  }

  async get(id: string): Promise<JobExecution | undefined> {
    return this.executions.get(id);
  }

  async listByJobId(
    jobId: string,
    limit = 50,
    offset = 0,
  ): Promise<JobExecution[]> {
    const executions = Array.from(this.executions.values())
      .filter((e) => e.jobId === jobId)
      .sort(
        (a, b) =>
          new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime(),
      );

    return executions.slice(offset, offset + limit);
  }

  async updateStatus(
    id: string,
    status: JobExecutionStatus,
    runId?: string,
    error?: string,
  ): Promise<void> {
    const execution = this.executions.get(id);
    if (execution) {
      execution.status = status;
      if (runId !== undefined) execution.runId = runId;
      if (error !== undefined) execution.error = error;
    }
  }

  async hasRunningExecution(jobId: string): Promise<boolean> {
    return Array.from(this.executions.values()).some(
      (e) => e.jobId === jobId && e.status === "submitted",
    );
  }

  async countRecentFailures(jobId: string, limit: number): Promise<number> {
    return Array.from(this.executions.values())
      .filter((e) => e.jobId === jobId)
      .sort(
        (a, b) =>
          new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime(),
      )
      .slice(0, limit)
      .filter((e) => e.status === "failed").length;
  }
}
