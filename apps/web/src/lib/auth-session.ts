import { ApiResponseError, MissingApiKeyError } from "../api-client";
import type { ConsoleLocale } from "./locale";

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

export function describeConsoleError(
  error: unknown,
  locale: ConsoleLocale = "en",
): ConsoleErrorState {
  const isZh = locale === "zh-CN";

  if (error instanceof MissingApiKeyError) {
    return isZh
      ? {
          title: "\u9700\u8981 API \u5bc6\u94a5",
          message:
            "\u8bf7\u5148\u5728\u63a7\u5236\u53f0\u9876\u90e8\u914d\u7f6e Gateway API \u5bc6\u94a5\uff0c\u518d\u4f7f\u7528\u53d7\u4fdd\u62a4\u64cd\u4f5c\u3002",
        }
      : {
          title: "API key required",
          message:
            "Configure a gateway API key in the header before using protected console operations.",
        };
  }

  if (error instanceof ApiResponseError) {
    if (error.status === 401) {
      return isZh
        ? {
            title: "\u9274\u6743\u5931\u8d25",
            message:
              "\u5f53\u524d\u914d\u7f6e\u7684 API \u5bc6\u94a5\u88ab Gateway \u62d2\u7edd\uff0c\u8bf7\u66f4\u65b0\u540e\u91cd\u8bd5\u3002",
          }
        : {
            title: "Authentication failed",
            message:
              "The configured API key was rejected by the gateway. Update the key and retry the request.",
          };
    }

    if (error.status === 403) {
      return isZh
        ? {
            title: "\u6743\u9650\u4e0d\u8db3",
            message:
              "\u5f53\u524d API \u5bc6\u94a5\u6ca1\u6709\u6267\u884c\u8be5\u64cd\u4f5c\u7684\u6743\u9650\uff0c\u8bf7\u6362\u7528\u66f4\u9ad8\u6743\u9650\u7684\u5bc6\u94a5\u3002",
          }
        : {
            title: "Not enough permissions",
            message:
              "The configured API key does not have permission for this action. Use a key with the required role and retry.",
          };
    }
  }

  if (error instanceof Error) {
    return isZh
      ? {
          title: "\u8bf7\u6c42\u5931\u8d25",
          message: error.message,
        }
      : {
          title: "Request failed",
          message: error.message,
        };
  }

  return isZh
    ? {
        title: "\u8bf7\u6c42\u5931\u8d25",
        message:
          "\u4e0e Gateway \u901a\u4fe1\u65f6\u53d1\u751f\u4e86\u672a\u77e5\u9519\u8bef\u3002",
      }
    : {
        title: "Request failed",
        message: "An unexpected error occurred while talking to the gateway.",
      };
}
