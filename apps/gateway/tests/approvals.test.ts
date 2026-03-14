import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ApprovalQueue } from "../src/approval-queue.js";
import { createServer } from "../src/server.js";

describe("Gateway approvals API", () => {
  let app: FastifyInstance;
  let adminKey: string;
  let queue: ApprovalQueue;

  const authHeaders = () => ({ authorization: `Bearer ${adminKey}` });

  beforeEach(async () => {
    queue = new ApprovalQueue();
    const server = await createServer({ approvalQueue: queue });
    app = server.app;
    adminKey = server.bootstrapAdminKey ?? "";
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("lists pending approval requests", async () => {
    const created = queue.create({
      kind: "filesystem",
      action: "write",
      targetPaths: ["C:\\Windows\\System32\\drivers\\etc\\hosts"],
      reason: "The requested action requires elevated local permissions.",
      requestedBy: "tool:fs.write_text",
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/runtime/approvals",
      headers: authHeaders(),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      expect.objectContaining({
        id: created.id,
        status: "pending",
        kind: "filesystem",
      }),
    ]);
  });

  it("approves a pending request", async () => {
    const created = queue.create({
      kind: "shell",
      action: "execute",
      targetPaths: ["C:\\Windows\\System32"],
      reason: "The requested action requires elevated local permissions.",
      requestedBy: "tool:shell.exec",
    });

    const response = await app.inject({
      method: "POST",
      url: `/api/runtime/approvals/${created.id}/approve`,
      headers: authHeaders(),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: created.id,
      status: "approved",
    });
    expect(queue.get(created.id)).toMatchObject({ status: "approved" });
  });

  it("rejects a pending request", async () => {
    const created = queue.create({
      kind: "filesystem",
      action: "delete",
      targetPaths: ["C:\\Windows\\System32\\temp.txt"],
      reason: "The requested action requires elevated local permissions.",
      requestedBy: "tool:fs.delete",
    });

    const response = await app.inject({
      method: "POST",
      url: `/api/runtime/approvals/${created.id}/reject`,
      headers: authHeaders(),
      payload: { comment: "Denied by operator" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: created.id,
      status: "rejected",
      resolutionComment: "Denied by operator",
    });
    expect(queue.get(created.id)).toMatchObject({ status: "rejected" });
  });

  it("returns 404 for an unknown approval request", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/runtime/approvals/missing/approve",
      headers: authHeaders(),
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      error: "NOT_FOUND",
    });
  });
});
