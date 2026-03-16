import { EN_CONSOLE_COPY } from "./locale-copy-en.js";
import { ZH_CN_CONSOLE_COPY } from "./locale-copy-zh-cn.js";

export const CONSOLE_LOCALE_STORAGE_KEY = "senclaw.locale";

export type ConsoleLocale = "en" | "zh-CN";

export interface LocaleStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface ConsoleCopy {
  layout: {
    brand: string;
    nav: {
      agents: string;
      runs: string;
      submitTask: string;
      health: string;
    };
    localeToggle: string;
    darkModeLabel: string;
    lightModeLabel: string;
    apiKeyLabel: string;
    apiKeyPlaceholder: string;
    saveKey: string;
    clearKey: string;
    statusConfigured: string;
    statusMissing: string;
    sessionConfigured: string;
    sessionMissing: string;
    sessionSaved: string;
    sessionCleared: string;
    approvalsLabel: string;
    approvalsLoading: string;
    approvalsEmpty: string;
    approvalReasonLabel: string;
    approve: string;
    reject: string;
  };
  agents: {
    title: string;
    create: string;
    emptyTitle: string;
    emptyDescription: string;
    view: string;
    delete: string;
    deleteConfirm(name: string): string;
  };
  agentDetail: {
    back: string;
    submitTask: string;
    configuration: string;
    provider: string;
    model: string;
    temperature: string;
    maxTokens: string;
    tools: string;
    noTools: string;
    systemPrompt: string;
    notFound: string;
  };
  agentCreate: {
    title: string;
    description: string;
    name: string;
    systemPrompt: string;
    provider: string;
    model: string;
    temperature: string;
    maxTokens: string;
    tools: string;
    toolsPlaceholder: string;
    create: string;
    cancel: string;
  };
  runs: {
    title: string;
    submitTask: string;
    emptyTitle: string;
    emptyDescription: string;
    viewDetails: string;
  };
  runDetail: {
    back: string;
    title: string;
    information: string;
    runId: string;
    agentId: string;
    created: string;
    updated: string;
    input: string;
    error: string;
    messages: string;
    noMessages: string;
    notFound: string;
  };
  taskSubmit: {
    title: string;
    description: string;
    noAgentsTitle: string;
    noAgentsMessage: string;
    agent: string;
    input: string;
    inputPlaceholder: string;
    submit: string;
    cancel: string;
    latestRunTitle: string;
    latestRunStatus: string;
    latestRunMessages: string;
    waitingForResponse: string;
    noMessagesYet: string;
    viewRunDetails: string;
  };
  health: {
    title: string;
    description: string;
    overallStatus: string;
    healthy: string;
    degraded: string;
    unhealthy: string;
    unknown: string;
  };
}

const COPY: Record<ConsoleLocale, ConsoleCopy> = {
  en: EN_CONSOLE_COPY,
  "zh-CN": ZH_CN_CONSOLE_COPY,
};

function getBrowserStorage(): LocaleStorageLike | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export function normalizeLocale(
  value: string | null | undefined,
): ConsoleLocale {
  return value === "zh-CN" ? "zh-CN" : "en";
}

export function loadStoredLocale(
  storage: LocaleStorageLike | undefined = getBrowserStorage(),
): ConsoleLocale {
  return normalizeLocale(storage?.getItem(CONSOLE_LOCALE_STORAGE_KEY));
}

export function saveStoredLocale(
  locale: ConsoleLocale,
  storage: LocaleStorageLike | undefined = getBrowserStorage(),
): ConsoleLocale {
  const normalized = normalizeLocale(locale);
  if (storage) {
    storage.setItem(CONSOLE_LOCALE_STORAGE_KEY, normalized);
  }
  return normalized;
}

export function getConsoleCopy(locale: ConsoleLocale): ConsoleCopy {
  return COPY[normalizeLocale(locale)];
}
