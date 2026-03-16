import { useConsoleLocale } from "@/components/LocaleProvider";
import {
  Badge,
  Card,
  ErrorMessage,
  LoadingSpinner,
  Textarea,
} from "@/components/ui";
import { Button } from "@/components/ui/Button";
import {
  useAgents,
  useRun,
  useRunMessages,
  useSubmitTask,
} from "@/hooks/useAPI";
import { describeConsoleError } from "@/lib/auth-session";
import type { Message, Run } from "@/lib/api";
import type { ConsoleCopy } from "@/lib/locale";
import { getRunStatusVariant } from "@/lib/status";
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

function formatToolCallArgs(args: Record<string, unknown>): string {
  return JSON.stringify(args, null, 2);
}

function createMessageKey(message: Message, index: number): string {
  const toolCallIds =
    message.role === "assistant"
      ? (message.toolCalls?.map((call) => call.toolCallId).join(",") ?? "")
      : "";

  return [
    message.role,
    "toolCallId" in message ? (message.toolCallId ?? "") : "",
    message.content ?? "",
    toolCallIds,
    index,
  ].join("|");
}

export interface SubmittedRunPanelProps {
  run?: Run;
  messages?: Message[];
  isLoading: boolean;
  detailsHref: string;
  copy: ConsoleCopy["taskSubmit"];
}

export function SubmittedRunPanel({
  run,
  messages,
  isLoading,
  detailsHref,
  copy,
}: SubmittedRunPanelProps) {
  if (isLoading && !run) {
    return (
      <Card title={copy.latestRunTitle}>
        <LoadingSpinner />
      </Card>
    );
  }

  if (!run) {
    return null;
  }

  const items = messages ?? [];
  const emptyMessage =
    run.status === "pending" || run.status === "running"
      ? copy.waitingForResponse
      : copy.noMessagesYet;

  return (
    <Card
      title={copy.latestRunTitle}
      actions={
        <Link to={detailsHref} className="text-sm text-primary hover:underline">
          {copy.viewRunDetails}
        </Link>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-muted-foreground">
            {copy.latestRunStatus}
          </span>
          <Badge variant={getRunStatusVariant(run.status)}>{run.status}</Badge>
        </div>

        {run.error ? (
          <p className="text-sm text-destructive">{run.error}</p>
        ) : null}

        <div className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">
            {copy.latestRunMessages}
          </h2>
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">{emptyMessage}</p>
          ) : (
            <div className="space-y-3">
              {items.map((message, index) => (
                <div
                  key={createMessageKey(message, index)}
                  className="rounded-lg border p-3"
                >
                  <div className="mb-2">
                    <Badge>{message.role}</Badge>
                  </div>
                  {message.content ? (
                    <p className="whitespace-pre-wrap text-sm">
                      {message.content}
                    </p>
                  ) : null}
                  {message.role === "assistant" &&
                  message.toolCalls &&
                  message.toolCalls.length > 0 ? (
                    <div className="mt-2 space-y-2">
                      {message.toolCalls.map((call) => (
                        <div
                          key={call.toolCallId}
                          className="rounded bg-muted p-2 font-mono text-xs"
                        >
                          <div className="font-semibold">{call.toolName}</div>
                          <pre className="mt-1 whitespace-pre-wrap">
                            {formatToolCallArgs(call.args)}
                          </pre>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

// Task submission keeps its explicit state flow because it combines initial
// agent loading, mutation failures, and live run polling in a single screen.
export function TaskSubmit() {
  const { copy, locale } = useConsoleLocale();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const {
    data: agents,
    isLoading: agentsLoading,
    error: agentsError,
    refetch: refetchAgents,
  } = useAgents();
  const submitTask = useSubmitTask();

  const [agentId, setAgentId] = useState(searchParams.get("agentId") || "");
  const [input, setInput] = useState("");
  const [submitError, setSubmitError] = useState<unknown>();
  const [activeRunId, setActiveRunId] = useState<string>();

  const activeRunQuery = useRun(activeRunId ?? "");
  const activeMessagesQuery = useRunMessages(activeRunId ?? "");

  useEffect(() => {
    if (agents && agents.length > 0 && !agentId) {
      setAgentId(agents[0].id);
    }
  }, [agents, agentId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitError(undefined);
      setActiveRunId(undefined);
      const run = await submitTask.mutateAsync({ agentId, input });
      setActiveRunId(run.id);
    } catch (error) {
      setSubmitError(error);
    }
  };

  if (agentsLoading) {
    return <LoadingSpinner />;
  }

  if (agentsError) {
    const errorState = describeConsoleError(agentsError, locale);
    return (
      <ErrorMessage
        title={errorState.title}
        message={errorState.message}
        onRetry={() => refetchAgents()}
      />
    );
  }

  if (!agents || agents.length === 0) {
    return (
      <ErrorMessage
        title={copy.taskSubmit.noAgentsTitle}
        message={copy.taskSubmit.noAgentsMessage}
      />
    );
  }

  const submitErrorState = submitError
    ? describeConsoleError(submitError, locale)
    : undefined;
  const activeRunErrorState =
    activeRunQuery.error || activeMessagesQuery.error
      ? describeConsoleError(
          activeRunQuery.error ?? activeMessagesQuery.error,
          locale,
        )
      : undefined;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{copy.taskSubmit.title}</h1>
        <p className="mt-2 text-muted-foreground">
          {copy.taskSubmit.description}
        </p>
      </div>

      {submitErrorState ? (
        <ErrorMessage
          title={submitErrorState.title}
          message={submitErrorState.message}
          onRetry={() => setSubmitError(undefined)}
        />
      ) : null}

      <form onSubmit={handleSubmit}>
        <Card>
          <div className="space-y-6">
            <div className="space-y-2">
              <label htmlFor="agent-select" className="text-sm font-medium">
                {copy.taskSubmit.agent}
              </label>
              <select
                id="agent-select"
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                required
              >
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name}
                  </option>
                ))}
              </select>
            </div>

            <Textarea
              label={copy.taskSubmit.input}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={copy.taskSubmit.inputPlaceholder}
              rows={8}
              required
            />

            <div className="flex gap-2">
              <Button type="submit" loading={submitTask.isPending}>
                {copy.taskSubmit.submit}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => navigate("/runs")}
              >
                {copy.taskSubmit.cancel}
              </Button>
            </div>
          </div>
        </Card>
      </form>

      {activeRunErrorState ? (
        <ErrorMessage
          title={activeRunErrorState.title}
          message={activeRunErrorState.message}
          onRetry={() => {
            void activeRunQuery.refetch();
            void activeMessagesQuery.refetch();
          }}
        />
      ) : null}

      {activeRunId ? (
        <SubmittedRunPanel
          run={activeRunQuery.data}
          messages={activeMessagesQuery.data}
          isLoading={activeRunQuery.isLoading || activeMessagesQuery.isLoading}
          detailsHref={`/runs/${activeRunId}`}
          copy={copy.taskSubmit}
        />
      ) : null}
    </div>
  );
}
