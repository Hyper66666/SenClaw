import {
  getMetricsRegistry,
  resetMetricsRegistry,
} from "@senclaw/observability";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SchedulerService } from "../src/scheduler.js";

function createJob(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "49c490dd-a3ff-43e3-a8ad-2d7c4660fb0d",
    agentId: "d9074c7c-5f11-48dc-9161-eb331d2aa301",
    cronExpression: "* * * * *",
    timezone: "UTC",
    input: "run once",
    enabled: true,
    allowConcurrent: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    nextRunAt: new Date().toISOString(),
    ...overrides,
  };
}

function createTestLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

describe("SchedulerService", () => {
  beforeEach(() => {
    resetMetricsRegistry();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("rejects job creation when the target agent does not exist", async () => {
    const missingAgentId = "00000000-0000-4000-8000-000000000999";
    const agentService = {
      getAgent: vi.fn(async () => undefined),
      submitTask: vi.fn(async () => ({ id: "run-1" })),
    };
    const jobRepo = {
      findDueJobs: vi.fn(),
      disable: vi.fn(async () => undefined),
      updateNextRun: vi.fn(async () => undefined),
      create: vi.fn(),
      get: vi.fn(),
      list: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };
    const executionRepo = {
      hasRunningExecution: vi.fn(async () => false),
      countRecentFailures: vi.fn(async () => 0),
      create: vi.fn(async () => ({ id: "execution-1" })),
      listByJobId: vi.fn(async () => []),
      get: vi.fn(),
      update: vi.fn(),
      updateStatus: vi.fn(),
    };

    const scheduler = new SchedulerService(
      agentService as never,
      jobRepo as never,
      executionRepo as never,
    );

    await expect(
      scheduler.createJob({
        agentId: missingAgentId,
        name: "Missing agent",
        cronExpression: "* * * * *",
        input: "run once",
        timezone: "UTC",
      }),
    ).rejects.toThrow(`Agent "${missingAgentId}" not found`);
    expect(agentService.getAgent).toHaveBeenCalledWith(missingAgentId);
    expect(jobRepo.create).not.toHaveBeenCalled();
  });

  it("logs a submitted execution with run context", async () => {
    const job = createJob();
    const logger = createTestLogger();
    const agentService = {
      submitTask: vi.fn(async () => ({ id: "run-1" })),
    };
    const jobRepo = {
      findDueJobs: vi.fn().mockResolvedValueOnce([job]).mockResolvedValue([]),
      disable: vi.fn(async () => undefined),
      updateNextRun: vi.fn(async () => undefined),
      create: vi.fn(),
      get: vi.fn(),
      list: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };
    const executionRepo = {
      hasRunningExecution: vi.fn(async () => false),
      countRecentFailures: vi.fn(async () => 0),
      create: vi.fn(async () => ({ id: "execution-1" })),
      listByJobId: vi.fn(async () => []),
      get: vi.fn(),
      update: vi.fn(),
      updateStatus: vi.fn(),
    };

    const scheduler = new SchedulerService(
      agentService as never,
      jobRepo as never,
      executionRepo as never,
      { tickIntervalMs: 5, logger } as never,
    );

    scheduler.start();
    await new Promise((resolve) => setTimeout(resolve, 20));
    scheduler.stop();

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: job.id,
        agentId: job.agentId,
        runId: "run-1",
        status: "submitted",
        durationMs: expect.any(Number),
      }),
      "Job execution submitted",
    );

    const output = await getMetricsRegistry().metrics();
    expect(output).toContain(
      `scheduler_jobs_executed_total{job_id="${job.id}"} 1`,
    );
    expect(output).toContain("scheduler_execution_duration_seconds_bucket");
    expect(output).toContain(`job_id="${job.id}"`);
  });

  it("does not start a new tick while the previous one is still running", async () => {
    const job = createJob();

    let releaseRun: (() => void) | undefined;
    const pendingRun = new Promise<{ id: string }>((resolve) => {
      releaseRun = () => resolve({ id: "run-1" });
    });

    const agentService = {
      submitTask: vi.fn(async () => pendingRun),
    };
    const jobRepo = {
      findDueJobs: vi.fn().mockResolvedValueOnce([job]).mockResolvedValue([]),
      disable: vi.fn(async () => undefined),
      updateNextRun: vi.fn(async () => undefined),
      create: vi.fn(),
      get: vi.fn(),
      list: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };
    const executionRepo = {
      hasRunningExecution: vi.fn(async () => false),
      countRecentFailures: vi.fn(async () => 0),
      create: vi.fn(async () => ({ id: "execution-1" })),
      listByJobId: vi.fn(async () => []),
      get: vi.fn(),
      update: vi.fn(),
      updateStatus: vi.fn(),
    };

    const scheduler = new SchedulerService(
      agentService as never,
      jobRepo as never,
      executionRepo as never,
      { tickIntervalMs: 5 },
    );

    scheduler.start();
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(agentService.submitTask).toHaveBeenCalledTimes(1);

    releaseRun?.();
    await new Promise((resolve) => setTimeout(resolve, 20));
    scheduler.stop();
  });

  it("records a skipped execution and logs a warning when a prior run is still active", async () => {
    const job = createJob();
    const logger = createTestLogger();
    const agentService = {
      submitTask: vi.fn(async () => ({ id: "run-1" })),
    };
    const jobRepo = {
      findDueJobs: vi.fn().mockResolvedValueOnce([job]).mockResolvedValue([]),
      disable: vi.fn(async () => undefined),
      updateNextRun: vi.fn(async () => undefined),
      create: vi.fn(),
      get: vi.fn(),
      list: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };
    const executionRepo = {
      hasRunningExecution: vi.fn(async () => true),
      countRecentFailures: vi.fn(async () => 0),
      create: vi.fn(async () => ({ id: "execution-skipped" })),
      listByJobId: vi.fn(async () => []),
      get: vi.fn(),
      update: vi.fn(),
      updateStatus: vi.fn(),
    };

    const scheduler = new SchedulerService(
      agentService as never,
      jobRepo as never,
      executionRepo as never,
      { tickIntervalMs: 5, logger } as never,
    );

    scheduler.start();
    await new Promise((resolve) => setTimeout(resolve, 20));
    scheduler.stop();

    expect(agentService.submitTask).not.toHaveBeenCalled();
    expect(executionRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: job.id,
        status: "skipped",
        error: "Previous execution still running",
      }),
    );
    expect(jobRepo.updateNextRun).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: job.id,
        agentId: job.agentId,
        status: "skipped",
        durationMs: expect.any(Number),
      }),
      "Job execution skipped",
    );

    const output = await getMetricsRegistry().metrics();
    expect(output).toContain(
      `scheduler_jobs_skipped_total{job_id="${job.id}"} 1`,
    );
    expect(output).toContain("scheduler_execution_duration_seconds_bucket");
    expect(output).toContain(`job_id="${job.id}"`);
  });

  it("logs an error when a job execution fails", async () => {
    const job = createJob({ allowConcurrent: true });
    const logger = createTestLogger();
    const agentService = {
      submitTask: vi.fn(async () => {
        throw new Error("boom");
      }),
    };
    const jobRepo = {
      findDueJobs: vi.fn().mockResolvedValueOnce([job]).mockResolvedValue([]),
      disable: vi.fn(async () => undefined),
      updateNextRun: vi.fn(async () => undefined),
      create: vi.fn(),
      get: vi.fn(),
      list: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };
    const executionRepo = {
      hasRunningExecution: vi.fn(async () => false),
      countRecentFailures: vi.fn(async () => 1),
      create: vi.fn(async () => ({ id: "execution-failed" })),
      listByJobId: vi.fn(async () => []),
      get: vi.fn(),
      update: vi.fn(),
      updateStatus: vi.fn(),
    };

    const scheduler = new SchedulerService(
      agentService as never,
      jobRepo as never,
      executionRepo as never,
      { tickIntervalMs: 5, logger } as never,
    );

    scheduler.start();
    await new Promise((resolve) => setTimeout(resolve, 20));
    scheduler.stop();

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: job.id,
        agentId: job.agentId,
        status: "failed",
        errorMessage: "boom",
        durationMs: expect.any(Number),
      }),
      "Job execution failed",
    );

    const output = await getMetricsRegistry().metrics();
    expect(output).toContain(
      `scheduler_jobs_failed_total{job_id="${job.id}"} 1`,
    );
    expect(output).toContain("scheduler_execution_duration_seconds_bucket");
    expect(output).toContain(`job_id="${job.id}"`);
  });

  it("disables a job after the third consecutive failure and logs a warning", async () => {
    const job = createJob({ allowConcurrent: true });
    const logger = createTestLogger();
    const failures = [{ status: "failed" }, { status: "failed" }];

    const agentService = {
      submitTask: vi.fn(async () => {
        throw new Error("boom");
      }),
    };
    const jobRepo = {
      findDueJobs: vi.fn().mockResolvedValueOnce([job]).mockResolvedValue([]),
      disable: vi.fn(async () => undefined),
      updateNextRun: vi.fn(async () => undefined),
      create: vi.fn(),
      get: vi.fn(),
      list: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };
    const executionRepo = {
      hasRunningExecution: vi.fn(async () => false),
      countRecentFailures: vi.fn(
        async () =>
          failures
            .slice(-5)
            .filter((execution) => execution.status === "failed").length,
      ),
      create: vi.fn(async (data: { status: string }) => {
        failures.push({ status: data.status });
        return { id: `execution-${failures.length}` };
      }),
      listByJobId: vi.fn(async () => []),
      get: vi.fn(),
      update: vi.fn(),
      updateStatus: vi.fn(),
    };

    const scheduler = new SchedulerService(
      agentService as never,
      jobRepo as never,
      executionRepo as never,
      { tickIntervalMs: 5, logger } as never,
    );

    scheduler.start();
    await new Promise((resolve) => setTimeout(resolve, 20));
    scheduler.stop();

    expect(jobRepo.disable).toHaveBeenCalledTimes(1);
    expect(jobRepo.updateNextRun).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: job.id,
        agentId: job.agentId,
        status: "disabled",
        recentFailures: 3,
      }),
      "Job disabled due to repeated failures",
    );
  });
});
