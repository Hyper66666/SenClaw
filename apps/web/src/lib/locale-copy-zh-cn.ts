import type { ConsoleCopy } from "./locale.js";

export const ZH_CN_CONSOLE_COPY: ConsoleCopy = {
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
    approvalsLabel: "\u5ba1\u6279",
    approvalsLoading:
      "\u6b63\u5728\u52a0\u8f7d\u5f85\u5904\u7406\u5ba1\u6279...",
    approvalsEmpty:
      "\u5f53\u524d\u6ca1\u6709\u5f85\u5904\u7406\u5ba1\u6279\u3002",
    approvalReasonLabel: "\u539f\u56e0",
    approve: "\u6279\u51c6",
    reject: "\u62d2\u7edd",
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
    latestRunTitle: "\u6700\u65b0\u8fd0\u884c",
    latestRunStatus: "\u72b6\u6001",
    latestRunMessages: "\u5b9e\u65f6\u8f93\u51fa",
    waitingForResponse: "\u6b63\u5728\u7b49\u5f85 Agent \u8fd4\u56de...",
    noMessagesYet: "\u8fd8\u6ca1\u6709\u6d88\u606f",
    viewRunDetails: "\u67e5\u770b\u5b8c\u6574\u8fd0\u884c\u8be6\u60c5",
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
};
