import { type ChildProcess, spawn } from "node:child_process";
import { readFile } from "node:fs/promises";

const CPU_MONITOR_POLL_INTERVAL_MS = 250;
const CPU_MONITOR_MIN_ELAPSED_MS = 500;
const CPU_MONITOR_GRACE_MS = 100;

let linuxClockTicksPerSecondPromise: Promise<number> | undefined;

export function isOutOfMemory(stderr: string): boolean {
  const normalized = stderr.toLowerCase();
  return (
    normalized.includes("heap out of memory") ||
    normalized.includes("allocation failed")
  );
}

async function runProbeCommand(
  command: string,
  args: string[],
): Promise<string | undefined> {
  return new Promise((resolvePromise, rejectPromise) => {
    let stdout = "";
    let stderr = "";

    const probe = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    probe.stdout?.setEncoding("utf8");
    probe.stdout?.on("data", (chunk) => {
      stdout += chunk;
    });

    probe.stderr?.setEncoding("utf8");
    probe.stderr?.on("data", (chunk) => {
      stderr += chunk;
    });

    probe.on("error", (error) => {
      rejectPromise(error);
    });

    probe.on("exit", (code) => {
      if (code === 0) {
        resolvePromise(stdout.trim() === "" ? undefined : stdout.trim());
        return;
      }

      rejectPromise(
        new Error(stderr.trim() || `Probe exited with code ${code}`),
      );
    });
  });
}

async function getLinuxClockTicksPerSecond(): Promise<number> {
  linuxClockTicksPerSecondPromise ??= runProbeCommand("getconf", ["CLK_TCK"])
    .then((output) => {
      const parsed = Number(output);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 100;
    })
    .catch(() => 100);

  return linuxClockTicksPerSecondPromise;
}

export function parseLinuxProcessCpuTimeMs(
  statLine: string,
  clockTicksPerSecond: number,
): number | undefined {
  const processNameEnd = statLine.lastIndexOf(")");
  if (processNameEnd === -1) {
    return undefined;
  }

  const fields = statLine
    .slice(processNameEnd + 2)
    .trim()
    .split(/\s+/);
  const userTicks = Number(fields[11]);
  const systemTicks = Number(fields[12]);
  if (!Number.isFinite(userTicks) || !Number.isFinite(systemTicks)) {
    return undefined;
  }

  return ((userTicks + systemTicks) * 1000) / clockTicksPerSecond;
}

async function readLinuxProcessCpuTimeMs(
  pid: number,
): Promise<number | undefined> {
  try {
    const [statLine, clockTicksPerSecond] = await Promise.all([
      readFile(`/proc/${pid}/stat`, "utf8"),
      getLinuxClockTicksPerSecond(),
    ]);

    return parseLinuxProcessCpuTimeMs(statLine, clockTicksPerSecond);
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      return undefined;
    }

    throw error;
  }
}

async function readWindowsProcessCpuTimeMs(
  pid: number,
): Promise<number | undefined> {
  const output = await runProbeCommand("powershell.exe", [
    "-NoProfile",
    "-Command",
    `$process = Get-Process -Id ${pid} -ErrorAction SilentlyContinue; if ($null -ne $process) { Write-Output $process.CPU }`,
  ]);
  if (!output) {
    return undefined;
  }

  const seconds = Number(output.split(/\r?\n/).at(-1));
  return Number.isFinite(seconds) ? seconds * 1000 : undefined;
}

async function readProcessCpuTimeMs(pid: number): Promise<number | undefined> {
  if (process.platform === "linux") {
    return readLinuxProcessCpuTimeMs(pid);
  }

  if (process.platform === "win32") {
    return readWindowsProcessCpuTimeMs(pid);
  }

  return undefined;
}

export function shouldMonitorCpu(maxCpu: number): boolean {
  return Number.isFinite(maxCpu) && maxCpu > 0 && maxCpu < 100;
}

export function createCpuLimitMonitor(
  child: ChildProcess,
  maxCpu: number,
  onLimitExceeded: (error: Error) => void,
): () => void {
  const childPid = child.pid;
  if (!childPid || !shouldMonitorCpu(maxCpu)) {
    return () => {};
  }

  let checking = false;
  let stopped = false;
  const startedAt = Date.now();

  const intervalId = setInterval(() => {
    if (
      checking ||
      stopped ||
      child.exitCode !== null ||
      child.signalCode !== null
    ) {
      return;
    }

    checking = true;
    void readProcessCpuTimeMs(childPid)
      .then((cpuTimeMs) => {
        if (stopped || cpuTimeMs == null) {
          return;
        }

        const elapsedMs = Date.now() - startedAt;
        if (elapsedMs < CPU_MONITOR_MIN_ELAPSED_MS) {
          return;
        }

        const allowedCpuMs = elapsedMs * (maxCpu / 100) + CPU_MONITOR_GRACE_MS;
        if (cpuTimeMs > allowedCpuMs) {
          child.kill("SIGKILL");
          onLimitExceeded(
            new Error(`Tool execution exceeded CPU limit (${maxCpu}%)`),
          );
        }
      })
      .catch(() => {
        // Best-effort monitoring only. Timeout and crash handling stay active.
      })
      .finally(() => {
        checking = false;
      });
  }, CPU_MONITOR_POLL_INTERVAL_MS);

  intervalId.unref?.();

  return () => {
    stopped = true;
    clearInterval(intervalId);
  };
}
