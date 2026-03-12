import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  requireRolesMock: vi.fn(() => async () => {}),
}));

vi.mock("../src/auth/authorization.js", () => ({
  readRoles: ["admin", "user", "readonly"],
  writeRoles: ["admin", "user"],
  requireRoles: authMocks.requireRolesMock,
}));

vi.mock("@senclaw/scheduler", async () => {
  const cronEvaluator = await import(
    "../../../packages/scheduler/src/cron-evaluator.js"
  );

  return {
    isValidTimeZone: cronEvaluator.isValidTimeZone,
    validateCronExpression: cronEvaluator.validateCronExpression,
  };
});

import { jobRoutes } from "../src/routes/jobs.js";

function createSchedulerService(
  overrides: Partial<Record<string, unknown>> = {},
) {
  return {
    createJob: vi.fn(async () => undefined),
    listJobs: vi.fn(async () => []),
    getJob: vi.fn(async () => undefined),
    updateJob: vi.fn(async () => undefined),
    deleteJob: vi.fn(async () => false),
    getJobExecutions: vi.fn(async () => []),
    ...overrides,
  } as never;
}

describe("jobRoutes", () => {
  let app: Awaited<ReturnType<typeof Fastify>>;

  afterEach(async () => {
    await app?.close();
  });

  it("creates a job and returns the created payload", async () => {
    const job = {
      id: "job-1",
      agentId: "33c3d4ed-86bc-4fe4-b1e0-7c9ceffed001",
      name: "Daily job",
      cronExpression: "0 9 * * *",
      input: "hello",
      enabled: true,
      allowConcurrent: false,
      timezone: "UTC",
      maxRetries: 0,
      createdAt: "2026-03-11T00:00:00.000Z",
      updatedAt: "2026-03-11T00:00:00.000Z",
      nextRunAt: "2026-03-11T09:00:00.000Z",
    };
    const schedulerService = createSchedulerService({
      createJob: vi.fn(async () => job),
    });

    app = Fastify();
    await app.register(jobRoutes, {
      prefix: "/api/v1/jobs",
      schedulerService,
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/jobs",
      payload: {
        agentId: job.agentId,
        name: job.name,
        cronExpression: job.cronExpression,
        input: job.input,
        timezone: job.timezone,
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject(job);
    expect(schedulerService.createJob).toHaveBeenCalledWith({
      agentId: job.agentId,
      name: job.name,
      cronExpression: job.cronExpression,
      input: job.input,
      timezone: job.timezone,
    });
  });

  it("rejects job creation when the cron expression is invalid", async () => {
    const schedulerService = createSchedulerService();

    app = Fastify();
    await app.register(jobRoutes, {
      prefix: "/api/v1/jobs",
      schedulerService,
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/jobs",
      payload: {
        agentId: "33c3d4ed-86bc-4fe4-b1e0-7c9ceffed001",
        name: "bad cron",
        cronExpression: "not a cron",
        input: "hello",
        timezone: "UTC",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe("VALIDATION_ERROR");
    expect(schedulerService.createJob).not.toHaveBeenCalled();
  });

  it("rejects job creation when the timezone is invalid", async () => {
    const schedulerService = createSchedulerService();

    app = Fastify();
    await app.register(jobRoutes, {
      prefix: "/api/v1/jobs",
      schedulerService,
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/jobs",
      payload: {
        agentId: "33c3d4ed-86bc-4fe4-b1e0-7c9ceffed001",
        name: "bad timezone",
        cronExpression: "0 9 * * *",
        input: "hello",
        timezone: "Mars/Olympus",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe("VALIDATION_ERROR");
    expect(schedulerService.createJob).not.toHaveBeenCalled();
  });

  it("returns 404 when job creation targets a missing agent", async () => {
    const missingAgentId = "00000000-0000-4000-8000-000000000999";
    const schedulerService = createSchedulerService({
      createJob: vi.fn(async () => {
        throw new Error(`Agent "${missingAgentId}" not found`);
      }),
    });

    app = Fastify();
    await app.register(jobRoutes, {
      prefix: "/api/v1/jobs",
      schedulerService,
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/jobs",
      payload: {
        agentId: missingAgentId,
        name: "missing agent",
        cronExpression: "0 9 * * *",
        input: "hello",
        timezone: "UTC",
      },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      error: "NOT_FOUND",
      message: `Agent "${missingAgentId}" not found`,
    });
  });

  it("lists jobs with parsed filters", async () => {
    const jobs = [{ id: "job-1" }, { id: "job-2" }];
    const schedulerService = createSchedulerService({
      listJobs: vi.fn(async () => jobs),
    });

    app = Fastify();
    await app.register(jobRoutes, {
      prefix: "/api/v1/jobs",
      schedulerService,
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/jobs?agentId=agent-1&enabled=true",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(jobs);
    expect(schedulerService.listJobs).toHaveBeenCalledWith({
      agentId: "agent-1",
      enabled: true,
    });
  });

  it("returns a job by id", async () => {
    const job = {
      id: "job-1",
      agentId: "agent-1",
      name: "Daily job",
      cronExpression: "0 9 * * *",
      input: "hello",
      enabled: true,
      allowConcurrent: false,
      timezone: "UTC",
      maxRetries: 0,
      createdAt: "2026-03-11T00:00:00.000Z",
      updatedAt: "2026-03-11T00:00:00.000Z",
      nextRunAt: "2026-03-11T09:00:00.000Z",
    };
    const schedulerService = createSchedulerService({
      getJob: vi.fn(async () => job),
    });

    app = Fastify();
    await app.register(jobRoutes, {
      prefix: "/api/v1/jobs",
      schedulerService,
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/jobs/job-1",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject(job);
    expect(schedulerService.getJob).toHaveBeenCalledWith("job-1");
  });

  it("returns 404 when a job id does not exist", async () => {
    const schedulerService = createSchedulerService({
      getJob: vi.fn(async () => undefined),
    });

    app = Fastify();
    await app.register(jobRoutes, {
      prefix: "/api/v1/jobs",
      schedulerService,
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/jobs/job-missing",
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      error: "NOT_FOUND",
      message: 'Job "job-missing" not found',
    });
  });

  it("updates a job and returns the updated payload", async () => {
    const updatedJob = {
      id: "job-1",
      agentId: "agent-1",
      name: "Renamed job",
      cronExpression: "0 10 * * *",
      input: "updated input",
      enabled: false,
      allowConcurrent: false,
      timezone: "America/New_York",
      maxRetries: 0,
      createdAt: "2026-03-11T00:00:00.000Z",
      updatedAt: "2026-03-11T01:00:00.000Z",
      nextRunAt: "2026-03-11T14:00:00.000Z",
    };
    const schedulerService = createSchedulerService({
      updateJob: vi.fn(async () => updatedJob),
    });

    app = Fastify();
    await app.register(jobRoutes, {
      prefix: "/api/v1/jobs",
      schedulerService,
    });

    const response = await app.inject({
      method: "PATCH",
      url: "/api/v1/jobs/job-1",
      payload: {
        name: "Renamed job",
        cronExpression: "0 10 * * *",
        input: "updated input",
        enabled: false,
        timezone: "America/New_York",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject(updatedJob);
    expect(schedulerService.updateJob).toHaveBeenCalledWith("job-1", {
      name: "Renamed job",
      cronExpression: "0 10 * * *",
      input: "updated input",
      enabled: false,
      timezone: "America/New_York",
    });
  });

  it("rejects job updates when the timezone is invalid", async () => {
    const schedulerService = createSchedulerService();

    app = Fastify();
    await app.register(jobRoutes, {
      prefix: "/api/v1/jobs",
      schedulerService,
    });

    const response = await app.inject({
      method: "PATCH",
      url: "/api/v1/jobs/29f0f9b4-74d8-46d5-8bd8-5145ad13f001",
      payload: {
        timezone: "Mars/Olympus",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe("VALIDATION_ERROR");
    expect(schedulerService.updateJob).not.toHaveBeenCalled();
  });

  it("returns 404 when updating a missing job", async () => {
    const schedulerService = createSchedulerService({
      updateJob: vi.fn(async () => undefined),
    });

    app = Fastify();
    await app.register(jobRoutes, {
      prefix: "/api/v1/jobs",
      schedulerService,
    });

    const response = await app.inject({
      method: "PATCH",
      url: "/api/v1/jobs/job-missing",
      payload: {
        enabled: false,
      },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      error: "NOT_FOUND",
      message: 'Job "job-missing" not found',
    });
  });

  it("deletes a job and returns 204", async () => {
    const schedulerService = createSchedulerService({
      deleteJob: vi.fn(async () => true),
    });

    app = Fastify();
    await app.register(jobRoutes, {
      prefix: "/api/v1/jobs",
      schedulerService,
    });

    const response = await app.inject({
      method: "DELETE",
      url: "/api/v1/jobs/job-1",
    });

    expect(response.statusCode).toBe(204);
    expect(schedulerService.deleteJob).toHaveBeenCalledWith("job-1");
  });

  it("returns 404 when deleting a missing job", async () => {
    const schedulerService = createSchedulerService({
      deleteJob: vi.fn(async () => false),
    });

    app = Fastify();
    await app.register(jobRoutes, {
      prefix: "/api/v1/jobs",
      schedulerService,
    });

    const response = await app.inject({
      method: "DELETE",
      url: "/api/v1/jobs/job-missing",
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      error: "NOT_FOUND",
      message: 'Job "job-missing" not found',
    });
  });

  it("lists job executions with parsed pagination", async () => {
    const executions = [{ id: "exec-1" }, { id: "exec-2" }];
    const schedulerService = createSchedulerService({
      getJobExecutions: vi.fn(async () => executions),
    });

    app = Fastify();
    await app.register(jobRoutes, {
      prefix: "/api/v1/jobs",
      schedulerService,
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/jobs/job-1/executions?limit=5&offset=10",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(executions);
    expect(schedulerService.getJobExecutions).toHaveBeenCalledWith(
      "job-1",
      5,
      10,
    );
  });
});
