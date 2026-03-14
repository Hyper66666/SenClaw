import { useMemo, useState } from "react";
import type { ConsoleCopy } from "@/lib/locale";
import {
  type ApprovalRequest,
  useApproveApproval,
  useApprovals,
  useRejectApproval,
} from "@/lib/approvals";
import { useConsoleLocale } from "./LocaleProvider";
import { Button } from "./ui/Button";

export interface ApprovalInboxPanelProps {
  approvals: ApprovalRequest[];
  isLoading: boolean;
  busyId?: string;
  copy: ConsoleCopy["layout"];
  onApprove(id: string): void;
  onReject(id: string): void;
}

function formatTargets(approval: ApprovalRequest): string {
  return approval.targetPaths.length > 0
    ? approval.targetPaths.join(", ")
    : approval.requestedBy;
}

export function ApprovalInboxPanel({
  approvals,
  isLoading,
  busyId,
  copy,
  onApprove,
  onReject,
}: ApprovalInboxPanelProps) {
  if (isLoading) {
    return (
      <p className="text-sm text-muted-foreground">{copy.approvalsLoading}</p>
    );
  }

  if (approvals.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">{copy.approvalsEmpty}</p>
    );
  }

  return (
    <div className="space-y-3">
      {approvals.map((approval) => (
        <div key={approval.id} className="rounded-md border bg-background p-3">
          <div className="text-sm font-semibold text-foreground">
            {approval.id}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {approval.kind}/{approval.action} - {formatTargets(approval)}
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">
              {copy.approvalReasonLabel}:
            </span>{" "}
            {approval.reason}
          </div>
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              onClick={() => onApprove(approval.id)}
              disabled={busyId === approval.id}
            >
              {copy.approve}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onReject(approval.id)}
              disabled={busyId === approval.id}
            >
              {copy.reject}
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

export function ApprovalInbox({ hasApiKey }: { hasApiKey: boolean }) {
  const { copy } = useConsoleLocale();
  const [open, setOpen] = useState(false);
  const approvalsQuery = useApprovals(hasApiKey && open);
  const approveMutation = useApproveApproval();
  const rejectMutation = useRejectApproval();

  const approvals = approvalsQuery.data ?? [];
  const busyId = useMemo(() => {
    if (typeof approveMutation.variables === "string") {
      return approveMutation.variables;
    }

    if (
      rejectMutation.variables &&
      typeof rejectMutation.variables.id === "string"
    ) {
      return rejectMutation.variables.id;
    }

    return undefined;
  }, [approveMutation.variables, rejectMutation.variables]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="rounded-md px-3 py-2 text-sm font-medium hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
        disabled={!hasApiKey}
        aria-label={copy.layout.approvalsLabel}
      >
        {copy.layout.approvalsLabel}
        {approvals.length > 0 ? ` (${approvals.length})` : ""}
      </button>
      {open ? (
        <div className="absolute right-0 z-20 mt-2 w-[28rem] max-w-[calc(100vw-2rem)] rounded-lg border bg-card p-4 shadow-xl">
          <ApprovalInboxPanel
            approvals={approvals}
            isLoading={approvalsQuery.isLoading}
            busyId={busyId}
            copy={copy.layout}
            onApprove={(id) => {
              void approveMutation.mutateAsync(id);
            }}
            onReject={(id) => {
              void rejectMutation.mutateAsync({ id });
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
