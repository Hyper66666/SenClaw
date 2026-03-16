export interface ParsedApiErrorPayload {
  code: string;
  message: string;
  details?: unknown;
}

export function parseApiErrorPayload(
  payload: unknown,
  fallbackMessage: string,
): ParsedApiErrorPayload {
  if (!payload || typeof payload !== "object") {
    return {
      code: "UNKNOWN_ERROR",
      message: fallbackMessage,
      details: undefined,
    };
  }

  const record = payload as {
    error?: unknown;
    message?: unknown;
    details?: unknown;
  };

  return {
    code: typeof record.error === "string" ? record.error : "UNKNOWN_ERROR",
    message:
      typeof record.message === "string" ? record.message : fallbackMessage,
    details: "details" in record ? record.details : undefined,
  };
}

export function formatOperatorErrorMessage(
  status: number,
  message: string,
): string {
  if (status === 401) {
    return `Authentication failed: ${message}`;
  }

  if (status === 403) {
    return `Not enough permissions: ${message}`;
  }

  return message;
}
