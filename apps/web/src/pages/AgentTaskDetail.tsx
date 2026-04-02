import { Badge, Card, ErrorMessage, Textarea } from "@/components/ui";
import { Button } from "@/components/ui/Button";
import { QueryStateBoundary } from "@/components/QueryStateBoundary";
import { useConsoleLocale } from "@/components/LocaleProvider";
import {
  useAgentTask,
  useAgentTaskMessages,
  useResumeAgentTask,
  useSendAgentTaskMessage,
} from "@/hooks/useAPI";
import { getAgentTaskStatusVariant } from "@/lib/status";
import { formatDate } from "@/lib/utils";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";

function formatMetadata(value: Record<string, unknown>): string {
  return JSON.stringify(value, null, 2);
}

export function AgentTaskDetail() {
  const { copy, locale } = useConsoleLocale();
  const { id } = useParams<{ id: string }>();
  const [messageInput, setMessageInput] = useState("");

  if (!id) {
    return <ErrorMessage message={copy.agentTaskDetail.notFound} />;
  }

  const {
    data: task,
    isLoading: taskLoading,
    error: taskError,
    refetch: refetchTask,
  } = useAgentTask(id);
  const {
    data: messages,
    isLoading: messagesLoading,
    error: messagesError,
    refetch: refetchMessages,
  } = useAgentTaskMessages(id);
  const resumeTask = useResumeAgentTask();
  const sendMessage = useSendAgentTaskMessage();

  return (
    <QueryStateBoundary
      isLoading={taskLoading || messagesLoading}
      error={taskError ?? messagesError}
      locale={locale}
      onRetry={() => {
        void refetchTask();
        void refetchMessages();
      }}
    >
      {!task ? (
        <ErrorMessage message={copy.agentTaskDetail.notFound} />
      ) : (
        <div className="space-y-6">
          <div>
            <Link
              to="/agent-tasks"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              &lt; {copy.agentTaskDetail.back}
            </Link>
            <div className="mt-2 flex items-center gap-3">
              <h1 className="text-3xl font-bold">
                {copy.agentTaskDetail.title}
              </h1>
              <Badge variant={getAgentTaskStatusVariant(task.status)}>
                {task.status}
              </Badge>
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <Card title={copy.agentTaskDetail.information}>
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">
                    {copy.agentTaskDetail.taskId}
                  </h4>
                  <p className="mt-1 font-mono text-sm">{task.id}</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">
                    {copy.agentTaskDetail.agentId}
                  </h4>
                  <Link
                    to={`/agents/${task.selectedAgentId}`}
                    className="mt-1 block font-mono text-sm text-primary hover:underline"
                  >
                    {task.selectedAgentId}
                  </Link>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">
                    {copy.agentTaskDetail.activeRunId}
                  </h4>
                  {task.activeRunId ? (
                    <Link
                      to={`/runs/${task.activeRunId}`}
                      className="mt-1 block font-mono text-sm text-primary hover:underline"
                    >
                      {task.activeRunId}
                    </Link>
                  ) : (
                    <p className="mt-1 text-sm text-muted-foreground">-</p>
                  )}
                </div>
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">
                    {copy.agentTaskDetail.created}
                  </h4>
                  <p className="mt-1 text-sm">{formatDate(task.createdAt)}</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">
                    {copy.agentTaskDetail.updated}
                  </h4>
                  <p className="mt-1 text-sm">{formatDate(task.updatedAt)}</p>
                </div>
              </div>
            </Card>

            <Card title={copy.agentTaskDetail.initialInput}>
              <p className="whitespace-pre-wrap text-sm">{task.initialInput}</p>
            </Card>
          </div>

          <Card title={copy.agentTaskDetail.metadata}>
            <pre className="whitespace-pre-wrap text-xs">
              {formatMetadata(task.metadata)}
            </pre>
          </Card>

          {task.error ? (
            <Card title={copy.agentTaskDetail.error}>
              <p className="text-sm text-destructive">{task.error}</p>
            </Card>
          ) : null}

          <Card title={copy.agentTaskDetail.transcript}>
            {!messages || messages.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {copy.agentTaskDetail.noMessages}
              </p>
            ) : (
              <div className="space-y-3">
                {messages.map((message, index) => (
                  <div
                    key={`${message.role}-${message.content ?? ""}-${index}`}
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
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card
            title={copy.agentTaskDetail.sendMessage}
            actions={
              <Button
                type="button"
                variant="secondary"
                size="sm"
                loading={resumeTask.isPending}
                onClick={() => {
                  void resumeTask.mutateAsync(id).then(() => {
                    void refetchTask();
                    void refetchMessages();
                  });
                }}
              >
                {copy.agentTaskDetail.resume}
              </Button>
            }
          >
            <div className="space-y-4">
              <Textarea
                value={messageInput}
                onChange={(event) => setMessageInput(event.target.value)}
                placeholder={copy.agentTaskDetail.messagePlaceholder}
                rows={5}
              />
              <Button
                type="button"
                loading={sendMessage.isPending}
                disabled={messageInput.trim().length === 0}
                onClick={() => {
                  void sendMessage
                    .mutateAsync({
                      taskId: id,
                      request: { content: messageInput.trim() },
                    })
                    .then(() => {
                      setMessageInput("");
                      void refetchTask();
                      void refetchMessages();
                    });
                }}
              >
                {copy.agentTaskDetail.sendMessage}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </QueryStateBoundary>
  );
}
