import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ApprovalInboxPanel } from "../src/components/ApprovalInbox";
import { getConsoleCopy } from "../src/lib/locale";

describe("ApprovalInboxPanel", () => {
  it("renders pending approvals with reason and actions", () => {
    const html = renderToStaticMarkup(
      React.createElement(ApprovalInboxPanel, {
        approvals: [
          {
            id: "approval-1",
            kind: "shell",
            action: "execute",
            targetPaths: ["C:\\Windows\\System32"],
            reason: "The requested action requires elevated local permissions.",
            requestedBy: "tool:shell.exec",
            status: "pending",
          },
        ],
        isLoading: false,
        busyId: undefined,
        copy: getConsoleCopy("en").layout,
        onApprove: vi.fn(),
        onReject: vi.fn(),
      }),
    );

    expect(html).toContain("approval-1");
    expect(html).toContain(
      "The requested action requires elevated local permissions.",
    );
    expect(html).toContain("Approve");
    expect(html).toContain("Reject");
  });
});
