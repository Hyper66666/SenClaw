import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createApiClient } from "../api-client";
import { loadStoredApiKey } from "./auth-session";

export interface ApprovalRequest {
  id: string;
  kind: "filesystem" | "shell";
  action: string;
  targetPaths: string[];
  reason: string;
  requestedBy: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
  resolutionComment?: string;
}

const apiClient = createApiClient({
  getApiKey: loadStoredApiKey,
});

export const approvalsAPI = {
  list: () => apiClient.request<ApprovalRequest[]>("/api/runtime/approvals"),
  approve: (id: string) =>
    apiClient.request<ApprovalRequest>(`/api/runtime/approvals/${id}/approve`, {
      method: "POST",
    }),
  reject: (id: string, comment?: string) =>
    apiClient.request<ApprovalRequest>(`/api/runtime/approvals/${id}/reject`, {
      method: "POST",
      body: JSON.stringify(comment ? { comment } : {}),
    }),
};

export function useApprovals(enabled: boolean) {
  return useQuery({
    queryKey: ["approvals"],
    queryFn: approvalsAPI.list,
    enabled,
    refetchInterval: enabled ? 15_000 : false,
  });
}

export function useApproveApproval() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => approvalsAPI.approve(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["approvals"] });
    },
  });
}

export function useRejectApproval() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, comment }: { id: string; comment?: string }) =>
      approvalsAPI.reject(id, comment),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["approvals"] });
    },
  });
}
