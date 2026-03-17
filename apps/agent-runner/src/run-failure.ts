import type { IRunRepository } from "@senclaw/protocol";

export interface FailureLogger {
  error(payload: Record<string, unknown>, message: string): void;
}

export function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function markRunFailed(
  runId: string,
  error: unknown,
  runRepo: IRunRepository,
  runLogger: FailureLogger,
): Promise<void> {
  const errorMessage = toErrorMessage(error);

  try {
    await runRepo.updateStatus(runId, "failed", errorMessage);
  } catch (statusError) {
    runLogger.error(
      {
        error: statusError,
        originalError: errorMessage,
      },
      "Failed to persist failed run status",
    );
  }
}
