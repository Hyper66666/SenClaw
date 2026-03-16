import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { getConsoleCopy } from "../src/lib/locale";
import { SubmittedRunPanel } from "../src/pages/TaskSubmit";

describe("SubmittedRunPanel", () => {
  it("renders the latest run status, assistant messages, and a details link", () => {
    const copy = getConsoleCopy("en");
    const html = renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        undefined,
        React.createElement(SubmittedRunPanel, {
          run: {
            id: "run-1",
            agentId: "agent-1",
            input: "Read this folder",
            status: "running",
            createdAt: "2026-03-13T10:00:00.000Z",
            updatedAt: "2026-03-13T10:00:01.000Z",
          },
          messages: [
            {
              role: "assistant",
              content: "Listing files now.",
              toolCalls: [
                {
                  toolCallId: "call-1",
                  toolName: "fs.read_dir",
                  args: {
                    path: "D:\\senclaw",
                  },
                },
              ],
            },
          ],
          isLoading: false,
          detailsHref: "/runs/run-1",
          copy: copy.taskSubmit,
        }),
      ),
    );

    expect(html).toContain(copy.taskSubmit.latestRunTitle);
    expect(html).toContain("running");
    expect(html).toContain("Listing files now.");
    expect(html).toContain("fs.read_dir");
    expect(html).toContain("path");
    expect(html).toContain(copy.taskSubmit.viewRunDetails);
    expect(html).toContain("/runs/run-1");
  });
});
