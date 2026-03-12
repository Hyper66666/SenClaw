import type { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { APIClient, handleAPIError } from "../lib/api.js";

export function healthCommand(program: Command) {
  program
    .command("health")
    .description("Check system health status")
    .action(async () => {
      try {
        const spinner = ora("Checking health...").start();
        const client = new APIClient();
        const health = await client.getHealth();
        spinner.stop();

        const statusColors = {
          healthy: chalk.green,
          degraded: chalk.yellow,
          unhealthy: chalk.red,
        };

        const statusIcons = {
          healthy: "OK",
          degraded: "WARN",
          unhealthy: "ERR",
        };

        const color = statusColors[health.status] || chalk.white;
        const icon = statusIcons[health.status] || "?";

        console.log(
          color.bold(`\n${icon} Overall Status: ${health.status.toUpperCase()}\n`),
        );

        if (health.checks) {
          console.log(chalk.bold("Component Status:"));
          console.log(chalk.gray("-".repeat(50)));

          for (const [name, check] of Object.entries(health.checks)) {
            const checkColor = statusColors[check.status] || chalk.white;
            const checkIcon = statusIcons[check.status] || "?";

            console.log(
              `${checkColor(`${checkIcon} ${name}`)}: ${checkColor(check.status)}`,
            );

            if (check.detail) {
              console.log(chalk.dim(`  ${check.detail}`));
            }
          }
        }

        console.log();
      } catch (error) {
        handleAPIError(error);
      }
    });
}
