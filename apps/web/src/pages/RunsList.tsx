import {
  Badge,
  Card,
  EmptyState,
  ErrorMessage,
  LoadingSpinner,
} from "@/components/ui";
import { Button } from "@/components/ui/Button";
import { useRuns } from "@/hooks/useAPI";
import { describeConsoleError } from "@/lib/auth-session";
import { formatDate } from "@/lib/utils";
import { Link } from "react-router-dom";

export function RunsList() {
  const { data: runs, isLoading, error, refetch } = useRuns();

  if (isLoading) return <LoadingSpinner />;
  if (error) {
    const errorState = describeConsoleError(error);
    return (
      <ErrorMessage
        title={errorState.title}
        message={errorState.message}
        onRetry={() => refetch()}
      />
    );
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Runs</h1>
        <Link to="/tasks/new">
          <Button>Submit Task</Button>
        </Link>
      </div>

      {runs && runs.length === 0 ? (
        <EmptyState
          title="No runs yet"
          description="Submit a task to see runs here"
          action={
            <Link to="/tasks/new">
              <Button>Submit Task</Button>
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
                    <Badge variant={getStatusVariant(run.status)}>
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
                    View Details
                  </Button>
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
