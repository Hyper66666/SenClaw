import { describe, expect, it } from "vitest";
import {
  SANDBOX_WORKER_SOURCE,
  createExecuteMessage,
} from "../src/sandbox-worker-source";

describe("sandbox-worker-source", () => {
  it("builds execute messages with sandbox metadata", () => {
    const message = createExecuteMessage({
      handlerSource: "(args) => args",
      args: { path: "D:/senclaw" },
      sandboxLevel: 3,
      sandboxDirectory: "D:/tmp/sandbox",
      allowNetwork: true,
      allowedDomains: ["example.com"],
      allowedPaths: ["D:/senclaw"],
    });

    expect(message).toEqual({
      type: "execute",
      handlerSource: "(args) => args",
      args: { path: "D:/senclaw" },
      sandboxLevel: 3,
      sandboxDirectory: "D:/tmp/sandbox",
      allowNetwork: true,
      allowedDomains: ["example.com"],
      allowedPaths: ["D:/senclaw"],
    });
  });

  it("composes the worker source from filesystem and network policy fragments", () => {
    expect(SANDBOX_WORKER_SOURCE).toContain("applyFilesystemSandbox");
    expect(SANDBOX_WORKER_SOURCE).toContain("configureNetwork");
    expect(SANDBOX_WORKER_SOURCE).toContain('message.type !== "execute"');
  });
});
