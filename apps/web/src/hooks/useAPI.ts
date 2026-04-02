import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { agentAPI, agentTaskAPI, healthAPI, runAPI, taskAPI } from "@/lib/api";
import type {
  CreateAgent,
  CreateBackgroundAgentTaskRequest,
  SendAgentTaskMessageRequest,
  Task,
} from "@/lib/api";

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
    refetchInterval: 5000,
  });
}

export function useRun(id: string) {
  return useQuery({
    queryKey: ["runs", id],
    queryFn: () => runAPI.get(id),
    enabled: !!id,
    refetchInterval: (query) => {
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

export function useAgentTasks() {
  return useQuery({
    queryKey: ["agentTasks"],
    queryFn: agentTaskAPI.list,
    refetchInterval: 5000,
  });
}

export function useAgentTask(id: string) {
  return useQuery({
    queryKey: ["agentTasks", id],
    queryFn: () => agentTaskAPI.get(id),
    enabled: !!id,
    refetchInterval: (query) => {
      const data = query.state.data;
      return data?.status === "running" || data?.status === "pending"
        ? 2000
        : false;
    },
  });
}

export function useAgentTaskMessages(taskId: string) {
  const taskQuery = useAgentTask(taskId);
  return useQuery({
    queryKey: ["agentTasks", taskId, "messages"],
    queryFn: () => agentTaskAPI.getMessages(taskId),
    enabled: !!taskId,
    refetchInterval: () => {
      const task = taskQuery.data;
      return task && (task.status === "running" || task.status === "pending")
        ? 2000
        : false;
    },
  });
}

export function useCreateBackgroundTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: CreateBackgroundAgentTaskRequest) =>
      agentTaskAPI.createBackground(request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agentTasks"] });
    },
  });
}

export function useResumeAgentTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) => agentTaskAPI.resume(taskId),
    onSuccess: (_task, taskId) => {
      queryClient.invalidateQueries({ queryKey: ["agentTasks"] });
      queryClient.invalidateQueries({ queryKey: ["agentTasks", taskId] });
      queryClient.invalidateQueries({
        queryKey: ["agentTasks", taskId, "messages"],
      });
      queryClient.invalidateQueries({ queryKey: ["runs"] });
    },
  });
}

export function useSendAgentTaskMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      taskId,
      request,
    }: {
      taskId: string;
      request: SendAgentTaskMessageRequest;
    }) => agentTaskAPI.sendMessage(taskId, request),
    onSuccess: (_pending, variables) => {
      queryClient.invalidateQueries({ queryKey: ["agentTasks"] });
      queryClient.invalidateQueries({
        queryKey: ["agentTasks", variables.taskId],
      });
      queryClient.invalidateQueries({
        queryKey: ["agentTasks", variables.taskId, "messages"],
      });
      queryClient.invalidateQueries({ queryKey: ["runs"] });
    },
  });
}

export function useHealth() {
  return useQuery({
    queryKey: ["health"],
    queryFn: healthAPI.check,
    refetchInterval: 30000,
  });
}
