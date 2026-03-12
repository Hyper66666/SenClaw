#!/usr/bin/env node

import { Command } from "commander";
import { configCommand } from "./commands/config.js";
import { agentCommand } from "./commands/agent.js";
import { taskCommand } from "./commands/task.js";
import { runCommand } from "./commands/run.js";
import { healthCommand } from "./commands/health.js";
import { runtimeCommands } from "./commands/runtime.js";

const program = new Command();

program
  .name("senclaw")
  .description("Command-line interface for Senclaw AI agent platform")
  .version("0.1.0");

// Register commands
configCommand(program);
agentCommand(program);
taskCommand(program);
runCommand(program);
healthCommand(program);
runtimeCommands(program);

program.parse();
