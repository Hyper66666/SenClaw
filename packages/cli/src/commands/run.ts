import type { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { APIClient, handleAPIError, type Message } from "../lib/api.js";

function formatMessage(message: Message, index: number): string {
  const roleColors = {
    system: chalk.gray,
    user: chalk.blue,
    assistant: chalk.green,
    tool: chalk.yellow,
  };

  const color = roleColors[message.role] || chalk.white;
  let output = `\n${color.bold(`[${index + 1}] ${message.role.toUpperCase()}`)}\n`;

  if (message.content) {
    output += `${message.content}\n`;
  }

  if (message.toolCalls && message.toolCalls.length > 0) {
    for (const call of message.toolCalls) {
      output += chalk.dim(`\nTool Call: ${call.name}\n`);
      output += chalk.dim(`Arguments: ${call.arguments}\n`);
    }
  }

  return output;
}

export function runCommand(program: Command) {
  const run = program.command("run").description("Manage runs");

  run
    .command("get <run-id>")
    .description("Get run status")
    .action(async (runId: string) => {
      try {
        const client = new APIClient();
        const fetchedRun = await client.getRun(runId);

        console.log(chalk.bold("\nRun Details:"));
        console.log(chalk.gray("-".repeat(50)));
        console.log(`${chalk.bold("ID:")} ${fetchedRun.id}`);
        console.log(`${chalk.bold("Agent ID:")} ${fetchedRun.agentId}`);
        console.log(`${chalk.bold("Status:")} ${fetchedRun.status}`);
        console.log(
          `${chalk.bold("Created:")} ${new Date(fetchedRun.createdAt).toLocaleString()}`,
        );
        console.log(
          `${chalk.bold("Updated:")} ${new Date(fetchedRun.updatedAt).toLocaleString()}`,
        );

        if (fetchedRun.error) {
          console.log(`${chalk.bold("Error:")} ${chalk.red(fetchedRun.error)}`);
        }

        console.log(`\n${chalk.bold("Input:")}`);
        console.log(fetchedRun.input);
      } catch (error) {
        handleAPIError(error);
      }
    });

  run
    .command("logs <run-id>")
    .description("Display run message history")
    .option("-f, --follow", "Follow log output (poll for updates)")
    .action(async (runId: string, options: { follow?: boolean }) => {
      try {
        const client = new APIClient();

        if (options.follow) {
          console.log(chalk.dim("Following logs (Ctrl+C to stop)...\n"));

          let lastMessageCount = 0;
          const poll = async () => {
            try {
              const fetchedRun = await client.getRun(runId);
              const messages = await client.getRunMessages(runId);

              if (messages.length > lastMessageCount) {
                for (let i = lastMessageCount; i < messages.length; i += 1) {
                  console.log(formatMessage(messages[i], i));
                }
                lastMessageCount = messages.length;
              }

              if (
                fetchedRun.status === "completed" ||
                fetchedRun.status === "failed"
              ) {
                console.log(
                  chalk.dim(`\nRun ${fetchedRun.status}. Stopped following.`),
                );
                process.exit(0);
              }
            } catch {
              // Ignore transient polling failures while following a run.
            }
          };

          await poll();

          const interval = setInterval(poll, 2000);

          process.on("SIGINT", () => {
            clearInterval(interval);
            console.log(chalk.dim("\nStopped following logs"));
            process.exit(0);
          });
          return;
        }

        const spinner = ora("Fetching messages...").start();
        const messages = await client.getRunMessages(runId);
        spinner.stop();

        if (messages.length === 0) {
          console.log(chalk.yellow("No messages yet"));
          return;
        }

        console.log(chalk.bold("Message History:"));
        console.log(chalk.gray("-".repeat(50)));

        for (let i = 0; i < messages.length; i += 1) {
          console.log(formatMessage(messages[i], i));
        }
      } catch (error) {
        handleAPIError(error);
      }
    });
}
