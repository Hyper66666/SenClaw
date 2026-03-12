import { Card, ErrorMessage, LoadingSpinner, Textarea } from "@/components/ui";
import { Button } from "@/components/ui/Button";
import { useConsoleLocale } from "@/components/LocaleProvider";
import { useAgents, useSubmitTask } from "@/hooks/useAPI";
import { describeConsoleError } from "@/lib/auth-session";
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

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

  useEffect(() => {
    if (agents && agents.length > 0 && !agentId) {
      setAgentId(agents[0].id);
    }
  }, [agents, agentId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitError(undefined);
      const run = await submitTask.mutateAsync({ agentId, input });
      navigate(`/runs/${run.id}`);
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
    </div>
  );
}
