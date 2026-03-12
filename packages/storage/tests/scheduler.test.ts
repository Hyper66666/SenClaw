import { afterEach, describe, expect, it, vi } from "vitest";
import { createStorage } from "../src/index.js";

async function createSchedulerAgent(storage: ReturnType<typeof createStorage>) {
  return storage.agents.create({
    name: "Scheduler Agent",
    systemPrompt: "Run scheduled work",
    provider: { provider: "openai", model: "gpt-4o" },
    tools: [],
  });
}

describe("Scheduler storage repositories", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("supports job repository lifecycle operations and due-job filtering", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-11T00:30:00.000Z"));

    const storage = createStorage(":memory:");
    const agent = await createSchedulerAgent(storage);
    const dueJob = await storage.jobs.create({
      agentId: agent.id,
      name: "Due job",
      cronExpression: "* * * * *",
      input: "run due work",
      timezone: "UTC",
    });
    const futureJob = await storage.jobs.create({
      agentId: agent.id,
      name: "Future job",
      cronExpression: "0 9 * * *",
      input: "run later work",
      timezone: "UTC",
    });
    const disabledJob = await storage.jobs.create({
      agentId: agent.id,
      name: "Disabled job",
      cronExpression: "* * * * *",
      input: "skip me",
      timezone: "UTC",
    });

    await storage.jobs.updateNextRun(
      dueJob.id,
      new Date("2026-03-11T00:00:00.000Z"),
      new Date("2026-03-11T00:15:00.000Z"),
    );
    await storage.jobs.updateNextRun(
      futureJob.id,
      new Date("2026-03-11T00:00:00.000Z"),
      new Date("2026-03-11T01:00:00.000Z"),
    );
    await storage.jobs.update(disabledJob.id, { enabled: false });

    const fetched = await storage.jobs.get(dueJob.id);
    expect(fetched?.name).toBe("Due job");

    const listedJobs = await storage.jobs.list();
    expect(listedJobs.map((job) => job.id)).toEqual(
      expect.arrayContaining([dueJob.id, futureJob.id, disabledJob.id]),
    );

    const enabledJobs = await storage.jobs.list({ enabled: true });
    expect(enabledJobs.map((job) => job.id)).toEqual(
      expect.arrayContaining([dueJob.id, futureJob.id]),
    );
    expect(enabledJobs.map((job) => job.id)).not.toContain(disabledJob.id);

    const dueJobs = await storage.jobs.findDueJobs(
      new Date("2026-03-11T00:30:00.000Z"),
    );
    expect(dueJobs.map((job) => job.id)).toEqual([dueJob.id]);

    await expect(storage.jobs.delete(futureJob.id)).resolves.toBe(true);
    await expect(storage.jobs.get(futureJob.id)).resolves.toBeUndefined();
  });

  it("deletes execution history when a job is removed", async () => {
    const storage = createStorage(":memory:");
    const agent = await createSchedulerAgent(storage);
    const job = await storage.jobs.create({
      agentId: agent.id,
      name: "Cascade delete",
      cronExpression: "* * * * *",
      input: "run",
      timezone: "UTC",
    });
    const run = await storage.runs.create(job.agentId, job.input);

    await storage.executions.create({
      jobId: job.id,
      runId: run.id,
      status: "submitted",
      scheduledAt: new Date("2026-03-11T00:00:00.000Z"),
      executedAt: new Date("2026-03-11T00:00:01.000Z"),
    });

    await storage.jobs.delete(job.id);

    await expect(storage.executions.listByJobId(job.id)).resolves.toEqual([]);
  });

  it("treats pending runs as active executions and clears them when the run completes", async () => {
    const storage = createStorage(":memory:");
    const agent = await createSchedulerAgent(storage);
    const job = await storage.jobs.create({
      agentId: agent.id,
      name: "Pending run check",
      cronExpression: "* * * * *",
      input: "run",
      timezone: "UTC",
    });
    const run = await storage.runs.create(job.agentId, job.input);

    await storage.executions.create({
      jobId: job.id,
      runId: run.id,
      status: "submitted",
      scheduledAt: new Date("2026-03-11T00:00:00.000Z"),
      executedAt: new Date("2026-03-11T00:00:01.000Z"),
    });

    await expect(storage.executions.hasRunningExecution(job.id)).resolves.toBe(
      true,
    );

    await storage.runs.updateStatus(run.id, "completed");

    await expect(storage.executions.hasRunningExecution(job.id)).resolves.toBe(
      false,
    );
  });

  it("counts failures within the most recent execution window", async () => {
    const storage = createStorage(":memory:");
    const agent = await createSchedulerAgent(storage);
    const job = await storage.jobs.create({
      agentId: agent.id,
      name: "Failure window",
      cronExpression: "* * * * *",
      input: "run",
      timezone: "UTC",
    });

    const timeline = [
      { status: "failed", at: "2026-03-11T00:00:00.000Z" },
      { status: "submitted", at: "2026-03-11T00:01:00.000Z" },
      { status: "failed", at: "2026-03-11T00:02:00.000Z" },
      { status: "failed", at: "2026-03-11T00:03:00.000Z" },
    ] as const;

    for (const entry of timeline) {
      await storage.executions.create({
        jobId: job.id,
        status: entry.status,
        scheduledAt: new Date(entry.at),
        executedAt: new Date(entry.at),
        error: entry.status === "failed" ? "boom" : undefined,
      });
    }

    await expect(
      storage.executions.countRecentFailures(job.id, 2 as never),
    ).resolves.toBe(2);
    await expect(
      storage.executions.countRecentFailures(job.id, 3 as never),
    ).resolves.toBe(2);
    await expect(
      storage.executions.countRecentFailures(job.id, 4 as never),
    ).resolves.toBe(3);
  });

  it("recalculates nextRunAt when only the timezone changes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-11T00:30:00.000Z"));

    const storage = createStorage(":memory:");
    const agent = await createSchedulerAgent(storage);
    const job = await storage.jobs.create({
      agentId: agent.id,
      name: "Timezone update",
      cronExpression: "0 9 * * *",
      input: "run",
      timezone: "UTC",
    });

    const updated = await storage.jobs.update(job.id, {
      timezone: "America/New_York",
    });

    expect(updated?.timezone).toBe("America/New_York");
    expect(updated?.nextRunAt).not.toBe(job.nextRunAt);
  });
});
