import { Badge, Card, ErrorMessage } from "@/components/ui";
import { Button } from "@/components/ui/Button";
import { QueryStateBoundary } from "@/components/QueryStateBoundary";
import { useConsoleLocale } from "@/components/LocaleProvider";
import { useAgent } from "@/hooks/useAPI";
import { Link, useParams } from "react-router-dom";

export function AgentDetail() {
  const { copy, locale } = useConsoleLocale();
  const { id } = useParams<{ id: string }>();

  if (!id) {
    return <ErrorMessage message={copy.agentDetail.notFound} />;
  }

  const { data: agent, isLoading, error, refetch } = useAgent(id);

  return (
    <QueryStateBoundary
      isLoading={isLoading}
      error={error}
      locale={locale}
      onRetry={() => {
        void refetch();
      }}
    >
      {!agent ? (
        <ErrorMessage message={copy.agentDetail.notFound} />
      ) : (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <Link
                to="/agents"
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                &lt; {copy.agentDetail.back}
              </Link>
              <h1 className="mt-2 text-3xl font-bold">{agent.name}</h1>
            </div>
            <Link to={`/tasks/new?agentId=${agent.id}`}>
              <Button>{copy.agentDetail.submitTask}</Button>
            </Link>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <Card title={copy.agentDetail.configuration}>
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">
                    {copy.agentDetail.provider}
                  </h4>
                  <p className="mt-1">{agent.provider.provider}</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">
                    {copy.agentDetail.model}
                  </h4>
                  <p className="mt-1">{agent.provider.model}</p>
                </div>
                {agent.provider.temperature !== undefined && (
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground">
                      {copy.agentDetail.temperature}
                    </h4>
                    <p className="mt-1">{agent.provider.temperature}</p>
                  </div>
                )}
                {agent.provider.maxTokens !== undefined && (
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground">
                      {copy.agentDetail.maxTokens}
                    </h4>
                    <p className="mt-1">{agent.provider.maxTokens}</p>
                  </div>
                )}
              </div>
            </Card>

            <Card title={copy.agentDetail.tools}>
              {agent.tools.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {copy.agentDetail.noTools}
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {agent.tools.map((tool) => (
                    <Badge key={tool}>{tool}</Badge>
                  ))}
                </div>
              )}
            </Card>
          </div>

          <Card title={copy.agentDetail.systemPrompt}>
            <pre className="whitespace-pre-wrap text-sm">
              {agent.systemPrompt}
            </pre>
          </Card>
        </div>
      )}
    </QueryStateBoundary>
  );
}
