import type { Message } from "@senclaw/protocol";
import { describe, expect, it } from "vitest";
import { formatRunMessage } from "../src/commands/run";

describe("formatRunMessage", () => {
  it("prints assistant tool calls using the shared protocol contract shape", () => {
    const message: Message = {
      role: "assistant",
      content: "Checking the folder.",
      toolCalls: [
        {
          toolCallId: "call-1",
          toolName: "fs.read_dir",
          args: {
            path: "D:\\senclaw",
          },
        },
      ],
    };

    const output = formatRunMessage(message, 0);

    expect(output).toContain("ASSISTANT");
    expect(output).toContain("Checking the folder.");
    expect(output).toContain("Tool Call: fs.read_dir");
    expect(output).toContain('"path": "D:\\\\senclaw"');
  });
});
