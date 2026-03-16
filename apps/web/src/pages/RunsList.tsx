import { Badge, Card, EmptyState } from "@/components/ui";
import { Button } from "@/components/ui/Button";
import { QueryStateBoundary } from "@/components/QueryStateBoundary";
import { useConsoleLocale } from "@/components/LocaleProvider";
import { useRuns } from "@/hooks/useAPI";
import { getRunStatusVariant } from "@/lib/status";
import { formatDate } from "@/lib/utils";
import { Link } from "react-router-dom";

export function RunsList() {
  const { copy, locale } = useConsoleLocale();
  const { data: runs, isLoading, error, refetch } = useRuns();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">{copy.runs.title}</h1>
        <Link to="/tasks/new">
          <Button>{copy.runs.submitTask}</Button>
        </Link>
      </div>

      <QueryStateBoundary
        isLoading={isLoading}
        error={error}
        locale={locale}
        onRetry={() => {
          void refetch();
        }}
      >
        {runs && runs.length === 0 ? (
          <EmptyState
            title={copy.runs.emptyTitle}
            description={copy.runs.emptyDescription}
            action={
              <Link to="/tasks/new">
                <Button>{copy.runs.submitTask}</Button>
              </Link>
            }
          />
        ) : (
          <div className="space-y-4">
            {runs?.map((run) => (
              <Card key={run.id}>
                <div className="flex items-start justify-between">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <Badge variant={getRunStatusVariant(run.status)}>
                        {run.status}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        {formatDate(run.createdAt)}
                      </span>
                    </div>
                    <p className="line-clamp-2 text-sm">{run.input}</p>
                    {run.error && (
                      <p className="text-sm text-destructive">{run.error}</p>
                    )}
                  </div>
                  <Link to={`/runs/${run.id}`}>
                    <Button variant="secondary" size="sm">
                      {copy.runs.viewDetails}
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
