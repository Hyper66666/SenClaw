import {
  Card,
  EmptyState,
  ErrorMessage,
  LoadingSpinner,
} from "@/components/ui";
import { Button } from "@/components/ui/Button";
import { useAgents, useDeleteAgent } from "@/hooks/useAPI";
import { describeConsoleError } from "@/lib/auth-session";
import { useState } from "react";
import { Link } from "react-router-dom";

export function AgentsList() {
  const { data: agents, isLoading, error, refetch } = useAgents();
  const deleteAgent = useDeleteAgent();
  const [deleteError, setDeleteError] = useState<unknown>();

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

  const deleteErrorState = deleteError
    ? describeConsoleError(deleteError)
    : undefined;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Agents</h1>
        <Link to="/agents/new">
          <Button>Create Agent</Button>
        </Link>
      </div>

      {deleteErrorState ? (
        <ErrorMessage
          title={deleteErrorState.title}
          message={deleteErrorState.message}
          onRetry={() => setDeleteError(undefined)}
        />
      ) : null}

      {agents && agents.length === 0 ? (
        <EmptyState
          title="No agents yet"
          description="Create your first agent to get started"
          action={
            <Link to="/agents/new">
              <Button>Create Agent</Button>
            </Link>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {agents?.map((agent) => (
            <Card key={agent.id}>
              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold">{agent.name}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {agent.provider.provider} / {agent.provider.model}
                  </p>
                </div>
                <p className="line-clamp-3 text-sm text-muted-foreground">
                  {agent.systemPrompt}
                </p>
                {agent.tools.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {agent.tools.map((tool) => (
                      <span
                        key={tool}
                        className="rounded-full bg-secondary px-2 py-1 text-xs"
                      >
                        {tool}
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <Link to={`/agents/${agent.id}`} className="flex-1">
                    <Button variant="secondary" className="w-full">
                      View
                    </Button>
                  </Link>
                  <Button
                    variant="danger"
                    onClick={async () => {
                      if (
                        !confirm(
                          `Are you sure you want to delete "${agent.name}"?`,
                        )
                      ) {
                        return;
                      }

                      try {
                        setDeleteError(undefined);
                        await deleteAgent.mutateAsync(agent.id);
                      } catch (mutationError) {
                        setDeleteError(mutationError);
                      }
                    }}
                    loading={deleteAgent.isPending}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
