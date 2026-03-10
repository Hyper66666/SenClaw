export interface ToolSandboxConfig {
  level: 0 | 1 | 2 | 3 | 4;
  timeout?: number;
  maxMemory?: number;
  maxCpu?: number;
  allowNetwork?: boolean;
  allowedDomains?: string[];
}

import type { z } from "zod/v4";

export interface ToolDefinition<T extends z.ZodType = z.ZodType> {
  name: string;
  description: string;
  inputSchema: T;
  sandbox?: ToolSandboxConfig;
}
