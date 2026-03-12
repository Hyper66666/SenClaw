import { spawnSync } from "node:child_process";
import type { Command } from "commander";
import chalk from "chalk";
import {
  createRuntimeCommandSpec,
  resolveSenclawWorkspaceRoot,
  type RuntimeAction,
} from "../lib/runtime.js";

function registerRuntimeAction(program: Command, action: RuntimeAction): void {
  program
    .command(action)
    .description(
      action === "start"
        ? "Start the local SenClaw runtime"
        : "Stop the local SenClaw runtime",
    )
    .option("-w, --workspace <path>", "Path to the SenClaw workspace root")
    .action((options: { workspace?: string }) => {
      try {
        const workspaceRoot = resolveSenclawWorkspaceRoot(options.workspace);
        const spec = createRuntimeCommandSpec(action, workspaceRoot);
        const result = spawnSync(spec.command, spec.args, {
          cwd: spec.workspaceRoot,
          env: process.env,
          stdio: "inherit",
        });

        if (result.error) {
          throw result.error;
        }

        if ((result.status ?? 0) !== 0) {
          process.exitCode = result.status ?? 1;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(chalk.red(message));
        process.exitCode = 1;
      }
    });
}

export function runtimeCommands(program: Command): void {
  registerRuntimeAction(program, "start");
  registerRuntimeAction(program, "stop");
}
