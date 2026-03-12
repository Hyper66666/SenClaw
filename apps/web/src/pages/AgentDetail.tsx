import { Badge, Card, ErrorMessage, LoadingSpinner } from "@/components/ui";
import { Button } from "@/components/ui/Button";
import { useAgent } from "@/hooks/useAPI";
import { describeConsoleError } from "@/lib/auth-session";
import { Link, useParams } from "react-router-dom";

export function AgentDetail() {
  const { id } = useParams<{ id: string }>();

  if (!id) {
    return <ErrorMessage message="Agent not found" />;
  }

  const { data: agent, isLoading, error, refetch } = useAgent(id);

  if (isLoading) {
    return <LoadingSpinner />;
  }

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

  if (!agent) {
    return <ErrorMessage message="Agent not found" />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link
            to="/agents"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            &lt; Back to agents
          </Link>
          <h1 className="mt-2 text-3xl font-bold">{agent.name}</h1>
        </div>
        <Link to={`/tasks/new?agentId=${agent.id}`}>
          <Button>Submit Task</Button>
        </Link>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card title="Configuration">
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-medium text-muted-foreground">
                Provider
              </h4>
              <p className="mt-1">{agent.provider.provider}</p>
            </div>
            <div>
              <h4 className="text-sm font-medium text-muted-foreground">
                Model
              </h4>
              <p className="mt-1">{agent.provider.model}</p>
            </div>
            {agent.provider.temperature !== undefined && (
              <div>
                <h4 className="text-sm font-medium text-muted-foreground">
                  Temperature
                </h4>
                <p className="mt-1">{agent.provider.temperature}</p>
              </div>
            )}
            {agent.provider.maxTokens !== undefined && (
              <div>
                <h4 className="text-sm font-medium text-muted-foreground">
                  Max Tokens
                </h4>
                <p className="mt-1">{agent.provider.maxTokens}</p>
              </div>
            )}
          </div>
        </Card>

        <Card title="Tools">
          {agent.tools.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tools configured</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {agent.tools.map((tool) => (
                <Badge key={tool}>{tool}</Badge>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card title="System Prompt">
        <pre className="whitespace-pre-wrap text-sm">{agent.systemPrompt}</pre>
      </Card>
    </div>
  );
}
