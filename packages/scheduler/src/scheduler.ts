import { getMetricsRegistry } from "@senclaw/observability";
import type {
  CreateScheduledJob,
  IExecutionRepository,
  IJobRepository,
  JobExecution,
  ScheduledJob,
  UpdateScheduledJob,
} from "@senclaw/protocol";
import { calculateNextRun } from "./cron-evaluator.js";

const SCHEDULER_EXECUTED_TOTAL = {
  help: "Total number of scheduler job executions that were submitted.",
  name: "scheduler_jobs_executed_total",
};

const SCHEDULER_FAILED_TOTAL = {
  help: "Total number of scheduler job executions that failed.",
  name: "scheduler_jobs_failed_total",
};

const SCHEDULER_SKIPPED_TOTAL = {
  help: "Total number of scheduler job executions that were skipped.",
  name: "scheduler_jobs_skipped_total",
};

const SCHEDULER_DURATION_SECONDS = {
  buckets: [0.001, 0.01, 0.05, 0.1, 0.5, 1, 5, 10],
  help: "Scheduler job execution duration in seconds.",
  name: "scheduler_execution_duration_seconds",
};

function incrementExecutionMetric(
  metric: { help: string; name: string },
  jobId: string,
): void {
  getMetricsRegistry()
    .registerCounter({
      ...metric,
      labelNames: ["job_id"],
    })
    .inc({ job_id: jobId });
}

function observeExecutionDuration(jobId: string, durationMs: number): void {
  getMetricsRegistry()
    .registerHistogram({
      ...SCHEDULER_DURATION_SECONDS,
      labelNames: ["job_id"],
    })
    .observe({ job_id: jobId }, durationMs / 1000);
}

export interface AgentService {
  submitTask(agentId: string, input: string): Promise<{ id: string }>;
  getAgent?(agentId: string): Promise<unknown | undefined>;
}

export interface SchedulerLogger {
  info(bindings: Record<string, unknown>, message: string): void;
  warn(bindings: Record<string, unknown>, message: string): void;
  error(bindings: Record<string, unknown>, message: string): void;
}

export interface SchedulerOptions {
  tickIntervalMs?: number;
  logger?: SchedulerLogger;
}

const noopLogger: SchedulerLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

export class SchedulerService {
  private tickInterval: NodeJS.Timeout | null = null;
  private readonly tickIntervalMs: number;
  private readonly logger: SchedulerLogger;
  private tickInProgress = false;

  constructor(
    private readonly agentService: AgentService,
    private readonly jobRepo: IJobRepository,
    private readonly executionRepo: IExecutionRepository,
    options: SchedulerOptions = {},
  ) {
    this.tickIntervalMs = options.tickIntervalMs ?? 10_000;
    this.logger = options.logger ?? noopLogger;
  }

  start(): void {
    if (this.tickInterval) return;

    this.tickInterval = setInterval(() => {
      void this.tick();
    }, this.tickIntervalMs);
  }

  stop(): void {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
  }

  private async tick(): Promise<void> {
    if (this.tickInProgress) {
      return;
    }

    this.tickInProgress = true;
    try {
      const now = new Date();
      const dueJobs = await this.jobRepo.findDueJobs(now);

      for (const job of dueJobs) {
        await this.executeJob(job, now);
      }
    } finally {
      this.tickInProgress = false;
    }
  }

  private async executeJob(job: ScheduledJob, now: Date): Promise<void> {
    const startedAt = Date.now();

    if (!job.allowConcurrent) {
      const hasRunning = await this.executionRepo.hasRunningExecution(job.id);
      if (hasRunning) {
        await this.recordSkippedExecution(job.id, now);
        await this.updateNextRun(job, now);
        const durationMs = Date.now() - startedAt;
        incrementExecutionMetric(SCHEDULER_SKIPPED_TOTAL, job.id);
        observeExecutionDuration(job.id, durationMs);
        this.logger.warn(
          {
            jobId: job.id,
            agentId: job.agentId,
            status: "skipped",
            scheduledAt: now.toISOString(),
            durationMs,
            reason: "Previous execution still running",
          },
          "Job execution skipped",
        );
        return;
      }
    }

    try {
      const run = await this.agentService.submitTask(job.agentId, job.input);
      await this.executionRepo.create({
        jobId: job.id,
        runId: run.id,
        status: "submitted",
        scheduledAt: now,
        executedAt: now,
      });
      await this.updateNextRun(job, now);
      const durationMs = Date.now() - startedAt;
      incrementExecutionMetric(SCHEDULER_EXECUTED_TOTAL, job.id);
      observeExecutionDuration(job.id, durationMs);
      this.logger.info(
        {
          jobId: job.id,
          agentId: job.agentId,
          runId: run.id,
          status: "submitted",
          scheduledAt: now.toISOString(),
          executedAt: now.toISOString(),
          durationMs,
        },
        "Job execution submitted",
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      await this.executionRepo.create({
        jobId: job.id,
        status: "failed",
        scheduledAt: now,
        executedAt: now,
        error: errorMessage,
      });
      await this.handleFailure(job, now);
      const durationMs = Date.now() - startedAt;
      incrementExecutionMetric(SCHEDULER_FAILED_TOTAL, job.id);
      observeExecutionDuration(job.id, durationMs);
      this.logger.error(
        {
          jobId: job.id,
          agentId: job.agentId,
          status: "failed",
          scheduledAt: now.toISOString(),
          executedAt: now.toISOString(),
          errorMessage,
          durationMs,
        },
        "Job execution failed",
      );
    }
  }

  private async handleFailure(job: ScheduledJob, now: Date): Promise<void> {
    const recentFailures = await this.executionRepo.countRecentFailures(
      job.id,
      5,
    );
    if (recentFailures >= 3) {
      await this.jobRepo.disable(job.id);
      this.logger.warn(
        {
          jobId: job.id,
          agentId: job.agentId,
          status: "disabled",
          recentFailures,
        },
        "Job disabled due to repeated failures",
      );
      return;
    }

    await this.updateNextRun(job, now);
  }

  private async updateNextRun(job: ScheduledJob, now: Date): Promise<void> {
    const nextRunAt = new Date(
      calculateNextRun(job.cronExpression, job.timezone),
    );
    await this.jobRepo.updateNextRun(job.id, now, nextRunAt);
  }

  private async recordSkippedExecution(
    jobId: string,
    now: Date,
  ): Promise<void> {
    await this.executionRepo.create({
      jobId,
      status: "skipped",
      scheduledAt: now,
      executedAt: now,
      error: "Previous execution still running",
    });
  }

  async createJob(data: CreateScheduledJob): Promise<ScheduledJob> {
    if (this.agentService.getAgent) {
      const agent = await this.agentService.getAgent(data.agentId);
      if (!agent) {
        throw new Error(`Agent "${data.agentId}" not found`);
      }
    }

    return this.jobRepo.create(data);
  }

  async getJob(id: string): Promise<ScheduledJob | undefined> {
    return this.jobRepo.get(id);
  }

  async listJobs(filters?: {
    agentId?: string;
    enabled?: boolean;
  }): Promise<ScheduledJob[]> {
    return this.jobRepo.list(filters);
  }

  async updateJob(
    id: string,
    data: UpdateScheduledJob,
  ): Promise<ScheduledJob | undefined> {
    return this.jobRepo.update(id, data);
  }

  async deleteJob(id: string): Promise<boolean> {
    return this.jobRepo.delete(id);
  }

  async getJobExecutions(
    jobId: string,
    limit?: number,
    offset?: number,
  ): Promise<JobExecution[]> {
    return this.executionRepo.listByJobId(jobId, limit, offset);
  }
}
