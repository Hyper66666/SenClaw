import type { Command } from "commander";
import chalk from "chalk";
import inquirer from "inquirer";
import ora from "ora";
import Table from "cli-table3";
import { APIClient } from "../lib/api.js";
import { withCLIErrorHandling } from "../lib/command-wrapper.js";
import { formatRunMessage } from "./run.js";

async function promptTaskInput(
  message: string,
  value?: string,
): Promise<string> {
  if (value) {
    return value;
  }

  const answers = await inquirer.prompt([
    {
      type: "editor",
      name: "input",
      message,
      validate: (input) => input.length > 0 || "Input is required",
    },
  ]);
  return answers.input;
}

export function taskCommand(program: Command) {
  const task = program.command("task").description("Manage tasks");

  task
    .command("submit <agent-id>")
    .description("Submit a task to an agent")
    .option("-i, --input <text>", "Task input (non-interactive)")
    .action(
      withCLIErrorHandling(
        async (agentId: string, options: { input?: string }) => {
          const input = await promptTaskInput("Task input:", options.input);

          const spinner = ora("Submitting task...").start();
          const client = new APIClient();
          const run = await client.submitTask(agentId, input);
          spinner.succeed("Task submitted successfully");

          console.log(chalk.gray(`Run ID: ${run.id}`));
          console.log(chalk.gray(`Status: ${run.status}`));
          console.log(
            chalk.dim(`\nUse 'senclaw run get ${run.id}' to check status`),
          );
        },
      ),
    );

  task
    .command("background <agent-id>")
    .description("Create a background agent task")
    .option("-i, --input <text>", "Task input (non-interactive)")
    .action(
      withCLIErrorHandling(
        async (agentId: string, options: { input?: string }) => {
          const input = await promptTaskInput(
            "Background task input:",
            options.input,
          );

          const spinner = ora("Creating background task...").start();
          const client = new APIClient();
          const createdTask = await client.createBackgroundTask({
            agentId,
            input,
          });
          spinner.succeed("Background task created successfully");

          console.log(chalk.gray(`Task ID: ${createdTask.id}`));
          console.log(chalk.gray(`Status: ${createdTask.status}`));
          console.log(
            chalk.dim(
              `\nUse 'senclaw task bg-get ${createdTask.id}' to inspect it`,
            ),
          );
        },
      ),
    );

  task
    .command("bg-list")
    .description("List background agent tasks")
    .action(
      withCLIErrorHandling(async () => {
        const client = new APIClient();
        const tasks = await client.listAgentTasks();

        if (tasks.length === 0) {
          console.log(chalk.yellow("No background agent tasks found"));
          return;
        }

        const table = new Table({
          head: ["ID", "Agent", "Status", "Active Run", "Created"],
          colWidths: [38, 38, 14, 38, 24],
        });

        for (const item of tasks) {
          table.push([
            item.id,
            item.selectedAgentId,
            item.status,
            item.activeRunId ?? "-",
            new Date(item.createdAt).toLocaleString(),
          ]);
        }

        console.log(table.toString());
      }),
    );

  task
    .command("bg-get <task-id>")
    .description("Show background agent task details")
    .action(
      withCLIErrorHandling(async (taskId: string) => {
        const client = new APIClient();
        const taskDetails = await client.getAgentTask(taskId);

        console.log(chalk.bold("\nBackground Agent Task:"));
        console.log(chalk.gray("-".repeat(50)));
        console.log(`${chalk.bold("ID:")} ${taskDetails.id}`);
        console.log(
          `${chalk.bold("Agent ID:")} ${taskDetails.selectedAgentId}`,
        );
        console.log(`${chalk.bold("Status:")} ${taskDetails.status}`);
        console.log(
          `${chalk.bold("Active Run:")} ${taskDetails.activeRunId ?? "-"}`,
        );
        console.log(
          `${chalk.bold("Created:")} ${new Date(taskDetails.createdAt).toLocaleString()}`,
        );
        console.log(
          `${chalk.bold("Updated:")} ${new Date(taskDetails.updatedAt).toLocaleString()}`,
        );
        if (taskDetails.error) {
          console.log(
            `${chalk.bold("Error:")} ${chalk.red(taskDetails.error)}`,
          );
        }

        console.log(`\n${chalk.bold("Initial Input:")}`);
        console.log(taskDetails.initialInput);

        console.log(`\n${chalk.bold("Metadata:")}`);
        console.log(JSON.stringify(taskDetails.metadata, null, 2));
      }),
    );

  task
    .command("bg-logs <task-id>")
    .description("Display background agent transcript")
    .action(
      withCLIErrorHandling(async (taskId: string) => {
        const client = new APIClient();
        const messages = await client.getAgentTaskMessages(taskId);

        if (messages.length === 0) {
          console.log(chalk.yellow("No transcript messages yet"));
          return;
        }

        for (let i = 0; i < messages.length; i += 1) {
          console.log(formatRunMessage(messages[i], i));
        }
      }),
    );

  task
    .command("bg-message <task-id>")
    .description("Send a follow-up message to a background agent task")
    .option("-i, --input <text>", "Follow-up input (non-interactive)")
    .option("--role <role>", "Message role: user or system", "user")
    .action(
      withCLIErrorHandling(
        async (
          taskId: string,
          options: { input?: string; role?: "user" | "system" },
        ) => {
          const input = await promptTaskInput(
            "Follow-up message:",
            options.input,
          );

          const spinner = ora("Sending follow-up message...").start();
          const client = new APIClient();
          const pending = await client.sendAgentTaskMessage(taskId, {
            content: input,
            role: options.role ?? "user",
          });
          spinner.succeed("Follow-up message queued");

          console.log(chalk.gray(`Message ID: ${pending.id}`));
          console.log(chalk.gray(`Task ID: ${pending.taskId}`));
        },
      ),
    );

  task
    .command("bg-resume <task-id>")
    .description("Resume a background agent task")
    .action(
      withCLIErrorHandling(async (taskId: string) => {
        const spinner = ora("Resuming background task...").start();
        const client = new APIClient();
        const taskDetails = await client.resumeAgentTask(taskId);
        spinner.succeed("Background task resumed");

        console.log(chalk.gray(`Task ID: ${taskDetails.id}`));
        console.log(chalk.gray(`Status: ${taskDetails.status}`));
        console.log(
          chalk.gray(`Active Run: ${taskDetails.activeRunId ?? "-"}`),
        );
      }),
    );
}
