import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { agentAPI, taskAPI, runAPI, healthAPI } from "@/lib/api";
import type { CreateAgent, Task } from "@/lib/api";

export function useAgents() {
  return useQuery({
    queryKey: ["agents"],
    queryFn: agentAPI.list,
  });
}

export function useAgent(id: string) {
  return useQuery({
    queryKey: ["agents", id],
    queryFn: () => agentAPI.get(id),
    enabled: !!id,
  });
}

export function useCreateAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateAgent) => agentAPI.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agents"] });
    },
  });
}

export function useDeleteAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => agentAPI.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agents"] });
    },
  });
}

export function useRuns() {
  return useQuery({
    queryKey: ["runs"],
    queryFn: runAPI.list,
    refetchInterval: 5000, // Poll every 5 seconds
  });
}

export function useRun(id: string) {
  return useQuery({
    queryKey: ["runs", id],
    queryFn: () => runAPI.get(id),
    enabled: !!id,
    refetchInterval: (query) => {
      // Poll while running
      const data = query.state.data;
      return data?.status === "running" || data?.status === "pending"
        ? 2000
        : false;
    },
  });
}

export function useRunMessages(runId: string) {
  const runQuery = useRun(runId);
  return useQuery({
    queryKey: ["runs", runId, "messages"],
    queryFn: () => runAPI.getMessages(runId),
    enabled: !!runId,
    refetchInterval: () => {
      // Poll while running
      const run = runQuery.data;
      return run && (run.status === "running" || run.status === "pending")
        ? 2000
        : false;
    },
  });
}

export function useSubmitTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (task: Task) => taskAPI.submit(task),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["runs"] });
    },
  });
}

export function useHealth() {
  return useQuery({
    queryKey: ["health"],
    queryFn: healthAPI.check,
    refetchInterval: 30000, // Poll every 30 seconds
  });
}
