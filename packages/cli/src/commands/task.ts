import type { Command } from "commander";
import chalk from "chalk";
import inquirer from "inquirer";
import ora from "ora";
import { APIClient, handleAPIError } from "../lib/api.js";

export function taskCommand(program: Command) {
  const task = program.command("task").description("Manage tasks");

  task
    .command("submit <agent-id>")
    .description("Submit a task to an agent")
    .option("-i, --input <text>", "Task input (non-interactive)")
    .action(async (agentId: string, options: { input?: string }) => {
      try {
        let input: string;

        if (options.input) {
          input = options.input;
        } else {
          const answers = await inquirer.prompt([
            {
              type: "editor",
              name: "input",
              message: "Task input:",
              validate: (value) => value.length > 0 || "Input is required",
            },
          ]);
          input = answers.input;
        }

        const spinner = ora("Submitting task...").start();
        const client = new APIClient();
        const run = await client.submitTask(agentId, input);
        spinner.succeed("Task submitted successfully");

        console.log(chalk.gray(`Run ID: ${run.id}`));
        console.log(chalk.gray(`Status: ${run.status}`));
        console.log(
          chalk.dim(`\nUse 'senclaw run get ${run.id}' to check status`),
        );
      } catch (error) {
        handleAPIError(error);
      }
    });
}
