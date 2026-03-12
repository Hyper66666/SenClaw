import type { Command } from "commander";
import chalk from "chalk";
import inquirer from "inquirer";
import Table from "cli-table3";
import { APIClient, handleAPIError } from "../lib/api.js";

export function agentCommand(program: Command) {
  const agent = program.command("agent").description("Manage agents");

  agent
    .command("create")
    .description("Create a new agent")
    .action(async () => {
      try {
        const answers = await inquirer.prompt([
          {
            type: "input",
            name: "name",
            message: "Agent name:",
            validate: (input) => input.length > 0 || "Name is required",
          },
          {
            type: "editor",
            name: "systemPrompt",
            message: "System prompt:",
            validate: (input) =>
              input.length > 0 || "System prompt is required",
          },
          {
            type: "input",
            name: "provider",
            message: "Provider:",
            default: "openai",
          },
          {
            type: "input",
            name: "model",
            message: "Model:",
            default: "gpt-4",
          },
          {
            type: "number",
            name: "temperature",
            message: "Temperature:",
            default: 0.7,
          },
          {
            type: "input",
            name: "tools",
            message: "Tools (comma-separated):",
            default: "",
          },
        ]);

        const client = new APIClient();
        const createdAgent = await client.createAgent({
          name: answers.name,
          systemPrompt: answers.systemPrompt,
          provider: {
            provider: answers.provider,
            model: answers.model,
            temperature: answers.temperature,
          },
          tools: answers.tools
            ? answers.tools.split(",").map((tool: string) => tool.trim())
            : [],
        });

        console.log(chalk.green("Agent created successfully"));
        console.log(chalk.gray(`ID: ${createdAgent.id}`));
      } catch (error) {
        handleAPIError(error);
      }
    });

  agent
    .command("list")
    .description("List all agents")
    .action(async () => {
      try {
        const client = new APIClient();
        const agents = await client.listAgents();

        if (agents.length === 0) {
          console.log(chalk.yellow("No agents found"));
          return;
        }

        const table = new Table({
          head: ["ID", "Name", "Provider", "Model", "Tools"],
          colWidths: [38, 20, 15, 15, 30],
        });

        for (const listedAgent of agents) {
          table.push([
            listedAgent.id,
            listedAgent.name,
            listedAgent.provider.provider,
            listedAgent.provider.model,
            listedAgent.tools.join(", ") || "-",
          ]);
        }

        console.log(table.toString());
      } catch (error) {
        handleAPIError(error);
      }
    });

  agent
    .command("get <id>")
    .description("Get agent details")
    .action(async (id: string) => {
      try {
        const client = new APIClient();
        const fetchedAgent = await client.getAgent(id);

        console.log(chalk.bold("\nAgent Details:"));
        console.log(chalk.gray("-".repeat(50)));
        console.log(`${chalk.bold("ID:")} ${fetchedAgent.id}`);
        console.log(`${chalk.bold("Name:")} ${fetchedAgent.name}`);
        console.log(
          `${chalk.bold("Provider:")} ${fetchedAgent.provider.provider}`,
        );
        console.log(`${chalk.bold("Model:")} ${fetchedAgent.provider.model}`);
        console.log(
          `${chalk.bold("Temperature:")} ${fetchedAgent.provider.temperature || "default"}`,
        );
        console.log(
          `${chalk.bold("Max Tokens:")} ${fetchedAgent.provider.maxTokens || "default"}`,
        );
        console.log(
          `${chalk.bold("Tools:")} ${fetchedAgent.tools.join(", ") || "none"}`,
        );
        console.log(`\n${chalk.bold("System Prompt:")}`);
        console.log(fetchedAgent.systemPrompt);
      } catch (error) {
        handleAPIError(error);
      }
    });

  agent
    .command("delete <id>")
    .description("Delete an agent")
    .action(async (id: string) => {
      try {
        const { confirm } = await inquirer.prompt([
          {
            type: "confirm",
            name: "confirm",
            message: "Are you sure you want to delete this agent?",
            default: false,
          },
        ]);

        if (!confirm) {
          console.log(chalk.yellow("Cancelled"));
          return;
        }

        const client = new APIClient();
        await client.deleteAgent(id);
        console.log(chalk.green("Agent deleted successfully"));
      } catch (error) {
        handleAPIError(error);
      }
    });
}
