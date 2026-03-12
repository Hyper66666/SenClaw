import { Badge, Card, ErrorMessage, LoadingSpinner } from "@/components/ui";
import { useConsoleLocale } from "@/components/LocaleProvider";
import { useRun, useRunMessages } from "@/hooks/useAPI";
import { describeConsoleError } from "@/lib/auth-session";
import { formatDate } from "@/lib/utils";
import { Link, useParams } from "react-router-dom";

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

  if (runLoading || messagesLoading) {
    return <LoadingSpinner />;
  }

  if (runError || messagesError) {
    const errorState = describeConsoleError(runError ?? messagesError, locale);
    return (
      <ErrorMessage
        title={errorState.title}
        message={errorState.message}
        onRetry={() => {
          void refetchRun();
          void refetchMessages();
        }}
      />
    );
  }

  if (!run) {
    return <ErrorMessage message={copy.runDetail.notFound} />;
  }

  const getStatusVariant = (
    status: string,
  ): "default" | "success" | "warning" | "danger" => {
    switch (status) {
      case "completed":
        return "success";
      case "running":
        return "warning";
      case "failed":
        return "danger";
      default:
        return "default";
    }
  };

  const keyedMessages = (() => {
    const counts = new Map<string, number>();
    return (messages ?? []).map((message) => {
      const baseKey = [
        message.role,
        message.toolCallId ?? "",
        message.content ?? "",
        message.toolCalls?.map((call) => call.id).join(",") ?? "",
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
          <Badge variant={getStatusVariant(run.status)}>{run.status}</Badge>
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
                {message.toolCalls && message.toolCalls.length > 0 && (
                  <div className="mt-2 space-y-2">
                    {message.toolCalls.map((call) => (
                      <div
                        key={call.id}
                        className="rounded bg-muted p-2 font-mono text-xs"
                      >
                        <div className="font-semibold">{call.name}</div>
                        <pre className="mt-1 whitespace-pre-wrap">
                          {call.arguments}
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
  );
}
