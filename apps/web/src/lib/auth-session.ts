import { ApiResponseError, MissingApiKeyError } from "../index";

export const API_KEY_STORAGE_KEY = "senclaw.apiKey";
export { MissingApiKeyError };

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface ConsoleErrorState {
  title: string;
  message: string;
}

function getBrowserStorage(): StorageLike | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function normalizeApiKey(
  apiKey: string | null | undefined,
): string | undefined {
  const trimmed = apiKey?.trim();
  return trimmed ? trimmed : undefined;
}

export function loadStoredApiKey(
  storage: StorageLike | undefined = getBrowserStorage(),
): string | undefined {
  return normalizeApiKey(storage?.getItem(API_KEY_STORAGE_KEY));
}

export function saveStoredApiKey(
  apiKey: string,
  storage: StorageLike | undefined = getBrowserStorage(),
): string | undefined {
  const normalized = normalizeApiKey(apiKey);
  if (!storage) {
    return normalized;
  }

  if (normalized) {
    storage.setItem(API_KEY_STORAGE_KEY, normalized);
    return normalized;
  }

  storage.removeItem(API_KEY_STORAGE_KEY);
  return undefined;
}

export function clearStoredApiKey(
  storage: StorageLike | undefined = getBrowserStorage(),
): void {
  storage?.removeItem(API_KEY_STORAGE_KEY);
}

export function describeConsoleError(error: unknown): ConsoleErrorState {
  if (error instanceof MissingApiKeyError) {
    return {
      title: "API key required",
      message:
        "Configure a gateway API key in the header before using protected console operations.",
    };
  }

  if (error instanceof ApiResponseError) {
    if (error.status === 401) {
      return {
        title: "Authentication failed",
        message:
          "The configured API key was rejected by the gateway. Update the key and retry the request.",
      };
    }

    if (error.status === 403) {
      return {
        title: "Not enough permissions",
        message:
          "The configured API key does not have permission for this action. Use a key with the required role and retry.",
      };
    }
  }

  if (error instanceof Error) {
    return {
      title: "Request failed",
      message: error.message,
    };
  }

  return {
    title: "Request failed",
    message: "An unexpected error occurred while talking to the gateway.",
  };
}
