import type { AgentService } from "@senclaw/agent-runner";
import type { ToolRegistry } from "@senclaw/tool-runner-host";
import { z } from "zod/v4";

const SpawnAgentTaskInputSchema = z.object({
  agentId: z.string().min(1),
  input: z.string().min(1),
  parentRunId: z.string().min(1).optional(),
  parentTaskId: z.string().min(1).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const ResumeAgentTaskInputSchema = z.object({
  taskId: z.string().min(1),
});

const SendMessageToAgentTaskInputSchema = z.object({
  taskId: z.string().min(1),
  content: z.string().min(1),
  role: z.enum(["user", "system"]).default("user"),
});

const InspectAgentTaskInputSchema = z.object({
  taskId: z.string().min(1),
});

export function registerAgentTaskOrchestrationTools(
  registry: ToolRegistry,
  agentService: AgentService,
): void {
  registry.register(
    {
      name: "agent_tasks.spawn",
      description:
        "Creates a background agent task for another agent definition.",
      inputSchema: SpawnAgentTaskInputSchema,
      concurrency: { safe: false },
    },
    async (args) => {
      const task = await agentService.createBackgroundTask(
        args.agentId,
        args.input,
        {
          parentRunId: args.parentRunId,
          parentTaskId: args.parentTaskId,
          metadata: args.metadata,
        },
      );
      return JSON.stringify(task);
    },
  );

  registry.register(
    {
      name: "agent_tasks.list",
      description:
        "Lists background agent tasks and their current execution state.",
      inputSchema: z.object({}).default({}),
      concurrency: { safe: true },
    },
    async () => JSON.stringify(await agentService.listAgentTasks()),
  );

  registry.register(
    {
      name: "agent_tasks.get",
      description:
        "Returns the current state and transcript summary for one background agent task.",
      inputSchema: InspectAgentTaskInputSchema,
      concurrency: { safe: true },
    },
    async (args) => {
      const task = await agentService.getAgentTask(args.taskId);
      const messages = await agentService.getAgentTaskMessages(args.taskId);
      return JSON.stringify({ task, messages });
    },
  );

  registry.register(
    {
      name: "agent_tasks.resume",
      description: "Resumes a stopped background agent task.",
      inputSchema: ResumeAgentTaskInputSchema,
      concurrency: { safe: false },
    },
    async (args) =>
      JSON.stringify(await agentService.resumeAgentTask(args.taskId)),
  );

  registry.register(
    {
      name: "agent_tasks.send_message",
      description:
        "Sends a follow-up message to a background agent task and resumes it when necessary.",
      inputSchema: SendMessageToAgentTaskInputSchema,
      concurrency: { safe: false },
    },
    async (args) =>
      JSON.stringify(
        await agentService.sendMessageToAgentTask(
          args.taskId,
          args.content,
          args.role,
        ),
      ),
  );
}
