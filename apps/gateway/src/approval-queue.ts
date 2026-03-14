import { randomUUID } from "node:crypto";

export type ApprovalKind = "filesystem" | "shell";
export type ApprovalStatus = "pending" | "approved" | "rejected";

export interface ApprovalRequest {
  id: string;
  kind: ApprovalKind;
  action: string;
  targetPaths: string[];
  reason: string;
  requestedBy: string;
  status: ApprovalStatus;
  createdAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
  resolutionComment?: string;
}

export interface CreateApprovalRequestInput {
  kind: ApprovalKind;
  action: string;
  targetPaths: string[];
  reason: string;
  requestedBy: string;
}

export class ApprovalQueue {
  private readonly requests = new Map<string, ApprovalRequest>();

  create(input: CreateApprovalRequestInput): ApprovalRequest {
    const request: ApprovalRequest = {
      id: randomUUID(),
      kind: input.kind,
      action: input.action,
      targetPaths: [...input.targetPaths],
      reason: input.reason,
      requestedBy: input.requestedBy,
      status: "pending",
      createdAt: new Date().toISOString(),
    };

    this.requests.set(request.id, request);
    return request;
  }

  list(status: ApprovalStatus | "all" = "pending"): ApprovalRequest[] {
    return Array.from(this.requests.values())
      .filter((request) => status === "all" || request.status === status)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  get(id: string): ApprovalRequest | undefined {
    return this.requests.get(id);
  }

  approve(id: string, resolvedBy: string): ApprovalRequest | undefined {
    const request = this.requests.get(id);
    if (!request) {
      return undefined;
    }

    const updated: ApprovalRequest = {
      ...request,
      status: "approved",
      resolvedAt: new Date().toISOString(),
      resolvedBy,
    };
    this.requests.set(id, updated);
    return updated;
  }

  reject(
    id: string,
    resolvedBy: string,
    resolutionComment?: string,
  ): ApprovalRequest | undefined {
    const request = this.requests.get(id);
    if (!request) {
      return undefined;
    }

    const updated: ApprovalRequest = {
      ...request,
      status: "rejected",
      resolvedAt: new Date().toISOString(),
      resolvedBy,
      resolutionComment,
    };
    this.requests.set(id, updated);
    return updated;
  }
}
