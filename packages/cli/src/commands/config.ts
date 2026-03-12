import type { Command } from "commander";
import chalk from "chalk";
import { getConfigValue, setConfigValue } from "../lib/config.js";

export function configCommand(program: Command) {
  const config = program.command("config").description("Manage CLI configuration");

  config
    .command("set <key> <value>")
    .description("Set a configuration value")
    .action((key: string, value: string) => {
      if (key !== "gatewayUrl" && key !== "apiKey") {
        console.error(chalk.red(`Invalid config key: ${key}`));
        console.log("Valid keys: gatewayUrl, apiKey");
        process.exit(1);
      }

      setConfigValue(key as "gatewayUrl" | "apiKey", value);
      console.log(chalk.green(`Set ${key} = ${value}`));
    });

  config
    .command("get <key>")
    .description("Get a configuration value")
    .action((key: string) => {
      if (key !== "gatewayUrl" && key !== "apiKey") {
        console.error(chalk.red(`Invalid config key: ${key}`));
        console.log("Valid keys: gatewayUrl, apiKey");
        process.exit(1);
      }

      const value = getConfigValue(key as "gatewayUrl" | "apiKey");
      if (value) {
        console.log(value);
      } else {
        console.log(chalk.yellow(`${key} is not set`));
      }
    });
}
