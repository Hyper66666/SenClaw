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
  en: {
    layout: {
      brand: "Senclaw",
      nav: {
        agents: "Agents",
        runs: "Runs",
        submitTask: "Submit Task",
        health: "Health",
      },
      localeToggle: "\u4e2d\u6587",
      darkModeLabel: "Dark mode",
      lightModeLabel: "Light mode",
      apiKeyLabel: "Gateway API key",
      apiKeyPlaceholder: "Paste a Senclaw API key",
      saveKey: "Save key",
      clearKey: "Clear",
      statusConfigured: "Configured",
      statusMissing: "Missing",
      sessionConfigured:
        "Protected API access is configured for this browser session.",
      sessionMissing: "Protected API operations need a gateway API key.",
      sessionSaved:
        "API key saved. Protected views can now retry their requests.",
      sessionCleared:
        "API key cleared. Protected requests will be blocked until a new key is configured.",
    },
    agents: {
      title: "Agents",
      create: "Create Agent",
      emptyTitle: "No agents yet",
      emptyDescription: "Create your first agent to get started",
      view: "View",
      delete: "Delete",
      deleteConfirm: (name) => `Are you sure you want to delete "${name}"?`,
    },
    agentDetail: {
      back: "Back to agents",
      submitTask: "Submit Task",
      configuration: "Configuration",
      provider: "Provider",
      model: "Model",
      temperature: "Temperature",
      maxTokens: "Max Tokens",
      tools: "Tools",
      noTools: "No tools configured",
      systemPrompt: "System Prompt",
      notFound: "Agent not found",
    },
    agentCreate: {
      title: "Create Agent",
      description: "Configure a new AI agent with custom behavior",
      name: "Name",
      systemPrompt: "System Prompt",
      provider: "Provider",
      model: "Model",
      temperature: "Temperature",
      maxTokens: "Max Tokens (optional)",
      tools: "Tools (comma-separated)",
      toolsPlaceholder: "echo, calculator",
      create: "Create Agent",
      cancel: "Cancel",
    },
    runs: {
      title: "Runs",
      submitTask: "Submit Task",
      emptyTitle: "No runs yet",
      emptyDescription: "Submit a task to see runs here",
      viewDetails: "View Details",
    },
    runDetail: {
      back: "Back to runs",
      title: "Run Details",
      information: "Information",
      runId: "Run ID",
      agentId: "Agent ID",
      created: "Created",
      updated: "Updated",
      input: "Input",
      error: "Error",
      messages: "Messages",
      noMessages: "No messages yet",
      notFound: "Run not found",
    },
    taskSubmit: {
      title: "Submit Task",
      description: "Send a task to an agent for processing",
      noAgentsTitle: "No agents available",
      noAgentsMessage: "Create an agent first before submitting tasks",
      agent: "Agent",
      input: "Input",
      inputPlaceholder: "Enter your task input...",
      submit: "Submit Task",
      cancel: "Cancel",
    },
    health: {
      title: "System Health",
      description: "Monitor the status of all system components",
      overallStatus: "Overall Status",
      healthy: "Healthy",
      degraded: "Degraded",
      unhealthy: "Unhealthy",
      unknown: "Unknown",
    },
  },
  "zh-CN": {
    layout: {
      brand: "Senclaw",
      nav: {
        agents: "\u667a\u80fd\u4f53",
        runs: "\u8fd0\u884c\u8bb0\u5f55",
        submitTask: "\u63d0\u4ea4\u4efb\u52a1",
        health: "\u5065\u5eb7\u72b6\u6001",
      },
      localeToggle: "EN",
      darkModeLabel: "\u591c\u95f4\u6a21\u5f0f",
      lightModeLabel: "\u65e5\u95f4\u6a21\u5f0f",
      apiKeyLabel: "Gateway API \u5bc6\u94a5",
      apiKeyPlaceholder: "\u7c98\u8d34\u4e00\u628a SenClaw API \u5bc6\u94a5",
      saveKey: "\u4fdd\u5b58\u5bc6\u94a5",
      clearKey: "\u6e05\u9664",
      statusConfigured: "\u5df2\u914d\u7f6e",
      statusMissing: "\u672a\u914d\u7f6e",
      sessionConfigured:
        "\u5f53\u524d\u6d4f\u89c8\u5668\u4f1a\u8bdd\u5df2\u914d\u7f6e\u53d7\u4fdd\u62a4 API \u8bbf\u95ee\u3002",
      sessionMissing:
        "\u53d7\u4fdd\u62a4\u64cd\u4f5c\u9700\u8981\u5148\u914d\u7f6e Gateway API \u5bc6\u94a5\u3002",
      sessionSaved:
        "API \u5bc6\u94a5\u5df2\u4fdd\u5b58\uff0c\u53d7\u4fdd\u62a4\u9875\u9762\u73b0\u5728\u53ef\u4ee5\u91cd\u8bd5\u8bf7\u6c42\u3002",
      sessionCleared:
        "API \u5bc6\u94a5\u5df2\u6e05\u9664\uff0c\u53d7\u4fdd\u62a4\u8bf7\u6c42\u4f1a\u88ab\u963b\u6b62\uff0c\u76f4\u5230\u91cd\u65b0\u914d\u7f6e\u3002",
    },
    agents: {
      title: "\u667a\u80fd\u4f53",
      create: "\u521b\u5efa\u667a\u80fd\u4f53",
      emptyTitle: "\u8fd8\u6ca1\u6709\u667a\u80fd\u4f53",
      emptyDescription:
        "\u5148\u521b\u5efa\u4f60\u7684\u7b2c\u4e00\u4e2a\u667a\u80fd\u4f53\u518d\u5f00\u59cb\u4f7f\u7528",
      view: "\u67e5\u770b",
      delete: "\u5220\u9664",
      deleteConfirm: (name) =>
        `\u786e\u5b9a\u8981\u5220\u9664 "${name}" \u5417\uff1f`,
    },
    agentDetail: {
      back: "\u8fd4\u56de\u667a\u80fd\u4f53\u5217\u8868",
      submitTask: "\u63d0\u4ea4\u4efb\u52a1",
      configuration: "\u914d\u7f6e",
      provider: "\u63d0\u4f9b\u65b9",
      model: "\u6a21\u578b",
      temperature: "\u6e29\u5ea6",
      maxTokens: "\u6700\u5927 Token \u6570",
      tools: "\u5de5\u5177",
      noTools: "\u672a\u914d\u7f6e\u5de5\u5177",
      systemPrompt: "\u7cfb\u7edf\u63d0\u793a\u8bcd",
      notFound: "\u672a\u627e\u5230\u667a\u80fd\u4f53",
    },
    agentCreate: {
      title: "\u521b\u5efa\u667a\u80fd\u4f53",
      description:
        "\u914d\u7f6e\u4e00\u4e2a\u5177\u6709\u81ea\u5b9a\u4e49\u884c\u4e3a\u7684\u65b0 AI \u667a\u80fd\u4f53",
      name: "\u540d\u79f0",
      systemPrompt: "\u7cfb\u7edf\u63d0\u793a\u8bcd",
      provider: "\u63d0\u4f9b\u65b9",
      model: "\u6a21\u578b",
      temperature: "\u6e29\u5ea6",
      maxTokens: "\u6700\u5927 Token \u6570\uff08\u53ef\u9009\uff09",
      tools: "\u5de5\u5177\uff08\u9017\u53f7\u5206\u9694\uff09",
      toolsPlaceholder: "echo, calculator",
      create: "\u521b\u5efa\u667a\u80fd\u4f53",
      cancel: "\u53d6\u6d88",
    },
    runs: {
      title: "\u8fd0\u884c\u8bb0\u5f55",
      submitTask: "\u63d0\u4ea4\u4efb\u52a1",
      emptyTitle: "\u8fd8\u6ca1\u6709\u8fd0\u884c\u8bb0\u5f55",
      emptyDescription:
        "\u63d0\u4ea4\u4e00\u6761\u4efb\u52a1\u540e\u4f1a\u5728\u8fd9\u91cc\u770b\u5230\u8fd0\u884c\u8bb0\u5f55",
      viewDetails: "\u67e5\u770b\u8be6\u60c5",
    },
    runDetail: {
      back: "\u8fd4\u56de\u8fd0\u884c\u8bb0\u5f55",
      title: "\u8fd0\u884c\u8be6\u60c5",
      information: "\u57fa\u672c\u4fe1\u606f",
      runId: "\u8fd0\u884c ID",
      agentId: "\u667a\u80fd\u4f53 ID",
      created: "\u521b\u5efa\u65f6\u95f4",
      updated: "\u66f4\u65b0\u65f6\u95f4",
      input: "\u8f93\u5165",
      error: "\u9519\u8bef",
      messages: "\u6d88\u606f",
      noMessages: "\u8fd8\u6ca1\u6709\u6d88\u606f",
      notFound: "\u672a\u627e\u5230\u8fd0\u884c\u8bb0\u5f55",
    },
    taskSubmit: {
      title: "\u63d0\u4ea4\u4efb\u52a1",
      description:
        "\u5411\u6307\u5b9a\u667a\u80fd\u4f53\u53d1\u9001\u4e00\u6761\u5f85\u5904\u7406\u4efb\u52a1",
      noAgentsTitle: "\u6ca1\u6709\u53ef\u7528\u667a\u80fd\u4f53",
      noAgentsMessage:
        "\u8bf7\u5148\u521b\u5efa\u667a\u80fd\u4f53\uff0c\u518d\u63d0\u4ea4\u4efb\u52a1",
      agent: "\u667a\u80fd\u4f53",
      input: "\u8f93\u5165",
      inputPlaceholder: "\u8f93\u5165\u4f60\u7684\u4efb\u52a1\u5185\u5bb9...",
      submit: "\u63d0\u4ea4\u4efb\u52a1",
      cancel: "\u53d6\u6d88",
    },
    health: {
      title: "\u7cfb\u7edf\u5065\u5eb7\u72b6\u6001",
      description:
        "\u67e5\u770b\u6240\u6709\u7cfb\u7edf\u7ec4\u4ef6\u7684\u8fd0\u884c\u72b6\u6001",
      overallStatus: "\u603b\u4f53\u72b6\u6001",
      healthy: "\u5065\u5eb7",
      degraded: "\u964d\u7ea7",
      unhealthy: "\u5f02\u5e38",
      unknown: "\u672a\u77e5",
    },
  },
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
