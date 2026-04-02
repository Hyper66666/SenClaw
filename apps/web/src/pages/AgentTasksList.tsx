import { Badge, Card, EmptyState } from "@/components/ui";
import { Button } from "@/components/ui/Button";
import { QueryStateBoundary } from "@/components/QueryStateBoundary";
import { useConsoleLocale } from "@/components/LocaleProvider";
import { useAgentTasks } from "@/hooks/useAPI";
import { getAgentTaskStatusVariant } from "@/lib/status";
import { formatDate } from "@/lib/utils";
import { Link } from "react-router-dom";

export function AgentTasksList() {
  const { copy, locale } = useConsoleLocale();
  const { data: tasks, isLoading, error, refetch } = useAgentTasks();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">{copy.agentTasks.title}</h1>
      </div>

      <QueryStateBoundary
        isLoading={isLoading}
        error={error}
        locale={locale}
        onRetry={() => {
          void refetch();
        }}
      >
        {tasks && tasks.length === 0 ? (
          <EmptyState
            title={copy.agentTasks.emptyTitle}
            description={copy.agentTasks.emptyDescription}
          />
        ) : (
          <div className="space-y-4">
            {tasks?.map((task) => (
              <Card key={task.id}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <Badge variant={getAgentTaskStatusVariant(task.status)}>
                        {task.status}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        {formatDate(task.createdAt)}
                      </span>
                    </div>
                    <p className="line-clamp-2 text-sm">{task.initialInput}</p>
                    <div className="text-xs text-muted-foreground">
                      {copy.agentTasks.activeRun}: {task.activeRunId ?? "-"}
                    </div>
                  </div>
                  <Link to={`/agent-tasks/${task.id}`}>
                    <Button variant="secondary" size="sm">
                      {copy.agentTasks.viewDetails}
                    </Button>
                  </Link>
                </div>
              </Card>
            ))}
          </div>
        )}
      </QueryStateBoundary>
    </div>
  );
}
