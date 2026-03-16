import { Badge, Card, ErrorMessage } from "@/components/ui";
import { QueryStateBoundary } from "@/components/QueryStateBoundary";
import { useConsoleLocale } from "@/components/LocaleProvider";
import { useRun, useRunMessages } from "@/hooks/useAPI";
import { getRunStatusVariant } from "@/lib/status";
import { formatDate } from "@/lib/utils";
import { Link, useParams } from "react-router-dom";

function formatToolCallArgs(args: Record<string, unknown>): string {
  return JSON.stringify(args, null, 2);
}

export function RunDetail() {
  const { copy, locale } = useConsoleLocale();
  const { id } = useParams<{ id: string }>();

  if (!id) {
    return <ErrorMessage message={copy.runDetail.notFound} />;
  }

  const {
    data: run,
    isLoading: runLoading,
    error: runError,
    refetch: refetchRun,
  } = useRun(id);
  const {
    data: messages,
    isLoading: messagesLoading,
    error: messagesError,
    refetch: refetchMessages,
  } = useRunMessages(id);

  const keyedMessages = (() => {
    const counts = new Map<string, number>();
    return (messages ?? []).map((message) => {
      const toolCallIds =
        message.role === "assistant"
          ? (message.toolCalls?.map((call) => call.toolCallId).join(",") ?? "")
          : "";
      const baseKey = [
        message.role,
        "toolCallId" in message ? (message.toolCallId ?? "") : "",
        message.content ?? "",
        toolCallIds,
      ].join("|");
      const occurrence = counts.get(baseKey) ?? 0;
      counts.set(baseKey, occurrence + 1);
      return {
        key: `${baseKey}|${occurrence}`,
        message,
      };
    });
  })();

  return (
    <QueryStateBoundary
      isLoading={runLoading || messagesLoading}
      error={runError ?? messagesError}
      locale={locale}
      onRetry={() => {
        void refetchRun();
        void refetchMessages();
      }}
    >
      {!run ? (
        <ErrorMessage message={copy.runDetail.notFound} />
      ) : (
        <div className="space-y-6">
          <div>
            <Link
              to="/runs"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              &lt; {copy.runDetail.back}
            </Link>
            <div className="mt-2 flex items-center gap-3">
              <h1 className="text-3xl font-bold">{copy.runDetail.title}</h1>
              <Badge variant={getRunStatusVariant(run.status)}>
                {run.status}
              </Badge>
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <Card title={copy.runDetail.information}>
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">
                    {copy.runDetail.runId}
                  </h4>
                  <p className="mt-1 font-mono text-sm">{run.id}</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">
                    {copy.runDetail.agentId}
                  </h4>
                  <Link
                    to={`/agents/${run.agentId}`}
                    className="mt-1 block font-mono text-sm text-primary hover:underline"
                  >
                    {run.agentId}
                  </Link>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">
                    {copy.runDetail.created}
                  </h4>
                  <p className="mt-1 text-sm">{formatDate(run.createdAt)}</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">
                    {copy.runDetail.updated}
                  </h4>
                  <p className="mt-1 text-sm">{formatDate(run.updatedAt)}</p>
                </div>
              </div>
            </Card>

            <Card title={copy.runDetail.input}>
              <p className="whitespace-pre-wrap text-sm">{run.input}</p>
            </Card>
          </div>

          {run.error && (
            <Card title={copy.runDetail.error}>
              <p className="text-sm text-destructive">{run.error}</p>
            </Card>
          )}

          <Card title={copy.runDetail.messages}>
            {keyedMessages.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {copy.runDetail.noMessages}
              </p>
            ) : (
              <div className="space-y-4">
                {keyedMessages.map(({ key, message }) => (
                  <div key={key} className="rounded-lg border p-4">
                    <div className="mb-2 flex items-center gap-2">
                      <Badge>{message.role}</Badge>
                    </div>
                    {message.content && (
                      <p className="whitespace-pre-wrap text-sm">
                        {message.content}
                      </p>
                    )}
                    {message.role === "assistant" &&
                      message.toolCalls &&
                      message.toolCalls.length > 0 && (
                        <div className="mt-2 space-y-2">
                          {message.toolCalls.map((call) => (
                            <div
                              key={call.toolCallId}
                              className="rounded bg-muted p-2 font-mono text-xs"
                            >
                              <div className="font-semibold">
                                {call.toolName}
                              </div>
                              <pre className="mt-1 whitespace-pre-wrap">
                                {formatToolCallArgs(call.args)}
                              </pre>
                            </div>
                          ))}
                        </div>
                      )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}
    </QueryStateBoundary>
  );
}
