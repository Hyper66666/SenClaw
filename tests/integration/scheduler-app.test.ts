import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer as createGatewayServer } from "../../apps/gateway/src/server";
import { startServer as startSchedulerServer } from "../../apps/scheduler/src/index";
import { calculateNextRun } from "../../packages/scheduler/src/cron-evaluator";
import { openDatabase } from "../../packages/storage/src/index";

type AgentRecord = { id: string };
type ApiKeyRecord = {
  id: string;
  key: string;
  name: string;
  revokedAt?: string | null;
};
type JobRecord = {
  id: string;
  cronExpression: string;
  enabled: boolean;
  nextRunAt: string;
  timezone: string;
};
type JobExecutionRecord = {
  error?: string;
  id: string;
  runId?: string;
  status: string;
};

describe("Scheduler app integration", () => {
  let app: FastifyInstance;
  let schedulerServer: Server;
  let adminKey = "";
  let testAdminKey = "";
  let bootstrapAdminKey = "";
  let dbUrl = "";
  let tempDir = "";

  const previousEnv = {
    dbUrl: process.env.SENCLAW_DB_URL,
    gatewayUrl: process.env.SENCLAW_GATEWAY_URL,
    schedulerApiKey: process.env.SENCLAW_SCHEDULER_API_KEY,
    schedulerTickIntervalMs: process.env.SENCLAW_SCHEDULER_TICK_INTERVAL_MS,
  };

  const authHeaders = (apiKey = testAdminKey || adminKey) => ({
    authorization: `Bearer ${apiKey}`,
  });

  async function createAgent(
    name: string,
    apiKey = testAdminKey || adminKey,
  ): Promise<AgentRecord> {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/agents",
      headers: authHeaders(apiKey),
      payload: {
        name,
        systemPrompt: "Execute scheduled work",
        provider: { provider: "test-provider", model: "test-model" },
        tools: [],
      },
    });
    expect(response.statusCode).toBe(201);
    return response.json() as AgentRecord;
  }

  async function createJob(
    agentId: string,
    overrides: Partial<{
      allowConcurrent: boolean;
      cronExpression: string;
      input: string;
      name: string;
      timezone: string;
    }> = {},
    apiKey = testAdminKey || adminKey,
  ): Promise<JobRecord> {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/jobs",
      headers: authHeaders(apiKey),
      payload: {
        agentId,
        name: overrides.name ?? "Integration job",
        cronExpression: overrides.cronExpression ?? "* * * * *",
        input: overrides.input ?? "run now",
        timezone: overrides.timezone ?? "UTC",
        allowConcurrent: overrides.allowConcurrent,
      },
    });
    expect(response.statusCode).toBe(201);
    return response.json() as JobRecord;
  }

  function withDatabase<T>(
    action: (database: ReturnType<typeof openDatabase>) => T,
  ): T {
    const database = openDatabase(dbUrl);
    try {
      return action(database);
    } finally {
      database.$client.close();
    }
  }

  function setJobDueNow(jobId: string): void {
    withDatabase((database) => {
      database.$client
        .prepare("update scheduled_jobs set next_run_at = ? where id = ?")
        .run(new Date(Date.now() - 1_000).toISOString(), jobId);
    });
  }

  function setRunStatus(runId: string, status: string): void {
    withDatabase((database) => {
      database.$client
        .prepare("update runs set status = ?, updated_at = ? where id = ?")
        .run(status, new Date().toISOString(), runId);
    });
  }

  function countRows(
    table: "job_executions" | "scheduled_jobs",
    idColumn: string,
    id: string,
  ): number {
    return withDatabase((database) => {
      const row = database.$client
        .prepare(`select count(*) as count from ${table} where ${idColumn} = ?`)
        .get(id) as { count: number | bigint };
      return Number(row.count);
    });
  }

  async function listExecutions(
    jobId: string,
    apiKey = testAdminKey || adminKey,
  ): Promise<JobExecutionRecord[]> {
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/jobs/${jobId}/executions`,
      headers: authHeaders(apiKey),
    });
    expect(response.statusCode).toBe(200);
    return response.json() as JobExecutionRecord[];
  }

  async function waitForExecution(
    jobId: string,
    predicate: (
      executions: JobExecutionRecord[],
    ) => JobExecutionRecord | undefined,
    apiKey = testAdminKey || adminKey,
    attempts = 16,
    delayMs = 250,
  ): Promise<JobExecutionRecord> {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const executions = await listExecutions(jobId, apiKey);
      const match = predicate(executions);
      if (match) {
        return match;
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    throw new Error(`Timed out waiting for execution on job ${jobId}`);
  }

  async function createTestAdminKey(): Promise<ApiKeyRecord> {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/keys",
      headers: authHeaders(adminKey),
      payload: {
        name: "Scheduler Integration Test Admin",
        role: "admin",
      },
    });
    expect(response.statusCode).toBe(201);
    return response.json() as ApiKeyRecord;
  }

  async function listKeys(
    apiKey = testAdminKey || adminKey,
  ): Promise<ApiKeyRecord[]> {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/keys",
      headers: authHeaders(apiKey),
    });
    expect(response.statusCode).toBe(200);
    return response.json() as ApiKeyRecord[];
  }

  beforeAll(async () => {
    tempDir = mkdtempSync(join(tmpdir(), "senclaw-scheduler-"));
    dbUrl = `file:${join(tempDir, "scheduler.db")}`;

    process.env.SENCLAW_DB_URL = dbUrl;
    process.env.SENCLAW_SCHEDULER_TICK_INTERVAL_MS = "600000";

    const gateway = await createGatewayServer();
    app = gateway.app;
    adminKey = gateway.bootstrapAdminKey ?? "";
    bootstrapAdminKey = adminKey;
    await app.listen({ port: 0, host: "127.0.0.1" });

    const createdKey = await createTestAdminKey();
    testAdminKey = createdKey.key;

    const gatewayAddress = app.server.address();
    if (!gatewayAddress || typeof gatewayAddress === "string") {
      throw new Error("Gateway did not bind to a TCP port");
    }

    process.env.SENCLAW_GATEWAY_URL = `http://127.0.0.1:${gatewayAddress.port}`;
    process.env.SENCLAW_SCHEDULER_API_KEY = bootstrapAdminKey;
    process.env.SENCLAW_SCHEDULER_TICK_INTERVAL_MS = "1000";

    schedulerServer = startSchedulerServer({ port: 0 });
    await once(schedulerServer, "listening");
  });

  afterAll(async () => {
    if (schedulerServer?.listening) {
      schedulerServer.close();
      await once(schedulerServer, "close");
    }

    if (app) {
      await app.close();
    }

    process.env.SENCLAW_DB_URL = previousEnv.dbUrl;
    process.env.SENCLAW_GATEWAY_URL = previousEnv.gatewayUrl;
    process.env.SENCLAW_SCHEDULER_API_KEY = previousEnv.schedulerApiKey;
    process.env.SENCLAW_SCHEDULER_TICK_INTERVAL_MS =
      previousEnv.schedulerTickIntervalMs;

    if (tempDir) {
      rmSync(tempDir, { force: true, recursive: true });
    }
  });

  it("creates a run for a due scheduled job", async () => {
    const agent = await createAgent("Scheduler Integration Agent");
    const job = await createJob(agent.id, {
      input: "run now",
      name: "Immediate job",
    });

    setJobDueNow(job.id);

    const submittedExecution = await waitForExecution(job.id, (executions) =>
      executions.find(
        (execution) => execution.status === "submitted" && execution.runId,
      ),
    );

    const runResponse = await app.inject({
      method: "GET",
      url: `/api/v1/runs/${submittedExecution.runId}`,
      headers: authHeaders(),
    });
    expect(runResponse.statusCode).toBe(200);
    expect(runResponse.json()).toMatchObject({
      agentId: agent.id,
      input: "run now",
    });
  });

  it("skips a due job when a previous execution is still running", async () => {
    const agent = await createAgent("Scheduler Concurrency Agent");
    const job = await createJob(agent.id, {
      allowConcurrent: false,
      input: "skip duplicate",
      name: "Non-concurrent job",
    });

    setJobDueNow(job.id);

    const firstExecution = await waitForExecution(job.id, (executions) =>
      executions.find(
        (execution) => execution.status === "submitted" && execution.runId,
      ),
    );

    setRunStatus(firstExecution.runId as string, "running");
    setJobDueNow(job.id);

    const skippedExecution = await waitForExecution(job.id, (executions) =>
      executions.find(
        (execution) =>
          execution.id !== firstExecution.id && execution.status === "skipped",
      ),
    );

    expect(skippedExecution).toMatchObject({
      status: "skipped",
      error: "Previous execution still running",
    });
  });

  it("calculates next run time using the configured timezone", async () => {
    const agent = await createAgent("Scheduler Timezone Agent");
    const job = await createJob(agent.id, {
      cronExpression: "0 9 * * *",
      name: "Tokyo morning job",
      timezone: "Asia/Tokyo",
    });

    expect(job.timezone).toBe("Asia/Tokyo");
    expect(job.nextRunAt).toBe(calculateNextRun("0 9 * * *", "Asia/Tokyo"));
  });

  it("recalculates next run time when the cron expression changes", async () => {
    const agent = await createAgent("Scheduler Update Agent");
    const job = await createJob(agent.id, {
      cronExpression: "0 9 * * *",
      name: "Mutable schedule",
      timezone: "UTC",
    });

    const updatedCronExpression = "30 10 * * *";
    const response = await app.inject({
      method: "PATCH",
      url: `/api/v1/jobs/${job.id}`,
      headers: authHeaders(),
      payload: {
        cronExpression: updatedCronExpression,
      },
    });
    expect(response.statusCode).toBe(200);

    const updatedJob = response.json() as JobRecord;
    expect(updatedJob.cronExpression).toBe(updatedCronExpression);
    expect(updatedJob.nextRunAt).toBe(
      calculateNextRun(updatedCronExpression, "UTC"),
    );
    expect(updatedJob.nextRunAt).not.toBe(job.nextRunAt);
  });

  it("deletes a job and cascades its executions", async () => {
    const agent = await createAgent("Scheduler Deletion Agent");
    const job = await createJob(agent.id, {
      input: "delete me",
      name: "Delete cascade job",
    });

    setJobDueNow(job.id);
    await waitForExecution(job.id, (executions) =>
      executions.find(
        (execution) => execution.status === "submitted" && execution.runId,
      ),
    );

    expect(countRows("job_executions", "job_id", job.id)).toBeGreaterThan(0);

    const deleteResponse = await app.inject({
      method: "DELETE",
      url: `/api/v1/jobs/${job.id}`,
      headers: authHeaders(),
    });
    expect(deleteResponse.statusCode).toBe(204);

    const getResponse = await app.inject({
      method: "GET",
      url: `/api/v1/jobs/${job.id}`,
      headers: authHeaders(),
    });
    expect(getResponse.statusCode).toBe(404);
    expect(countRows("scheduled_jobs", "id", job.id)).toBe(0);
    expect(countRows("job_executions", "job_id", job.id)).toBe(0);

    const executions = await listExecutions(job.id);
    expect(executions).toEqual([]);
  });

  it("disables a job after three task submission failures", async () => {
    const keys = await listKeys();
    const bootstrapKeyRecord = keys.find(
      (key) => key.name === "Bootstrap Admin Key" && !key.revokedAt,
    );
    expect(bootstrapKeyRecord).toBeDefined();

    const agent = await createAgent("Scheduler Failure Agent");
    const job = await createJob(agent.id, {
      input: "should fail",
      name: "Failure circuit breaker job",
    });

    const revokeResponse = await app.inject({
      method: "DELETE",
      url: `/api/v1/keys/${bootstrapKeyRecord?.id}`,
      headers: authHeaders(),
      payload: {
        reason: "scheduler integration failure test",
      },
    });
    expect(revokeResponse.statusCode).toBe(200);

    for (let failureCount = 1; failureCount <= 3; failureCount += 1) {
      setJobDueNow(job.id);

      await waitForExecution(job.id, (executions) => {
        const failedExecutions = executions.filter(
          (execution) => execution.status === "failed",
        );
        return failedExecutions.length >= failureCount
          ? failedExecutions[failedExecutions.length - 1]
          : undefined;
      });

      const jobResponse = await app.inject({
        method: "GET",
        url: `/api/v1/jobs/${job.id}`,
        headers: authHeaders(),
      });
      expect(jobResponse.statusCode).toBe(200);
      const currentJob = jobResponse.json() as JobRecord;
      expect(currentJob.enabled).toBe(failureCount < 3);
    }

    const executions = await listExecutions(job.id);
    expect(
      executions.filter((execution) => execution.status === "failed"),
    ).toHaveLength(3);
  });
});
