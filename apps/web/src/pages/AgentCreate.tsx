import { Card, ErrorMessage, Input, Textarea } from "@/components/ui";
import { Button } from "@/components/ui/Button";
import { useCreateAgent } from "@/hooks/useAPI";
import type { CreateAgent } from "@/lib/api";
import { describeConsoleError } from "@/lib/auth-session";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

export function AgentCreate() {
  const navigate = useNavigate();
  const createAgent = useCreateAgent();
  const [submitError, setSubmitError] = useState<unknown>();
  const [formData, setFormData] = useState<CreateAgent>({
    name: "",
    systemPrompt: "",
    provider: {
      provider: "openai",
      model: "gpt-4",
      temperature: 0.7,
    },
    tools: [],
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitError(undefined);
      await createAgent.mutateAsync(formData);
      navigate("/agents");
    } catch (error) {
      setSubmitError(error);
    }
  };

  const submitErrorState = submitError
    ? describeConsoleError(submitError)
    : undefined;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Create Agent</h1>
        <p className="mt-2 text-muted-foreground">
          Configure a new AI agent with custom behavior
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
            <Input
              label="Name"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              placeholder="My Agent"
              required
            />

            <Textarea
              label="System Prompt"
              value={formData.systemPrompt}
              onChange={(e) =>
                setFormData({ ...formData, systemPrompt: e.target.value })
              }
              placeholder="You are a helpful assistant..."
              rows={6}
              required
            />

            <div className="grid gap-4 md:grid-cols-2">
              <Input
                label="Provider"
                value={formData.provider.provider}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    provider: {
                      ...formData.provider,
                      provider: e.target.value,
                    },
                  })
                }
                placeholder="openai"
                required
              />

              <Input
                label="Model"
                value={formData.provider.model}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    provider: { ...formData.provider, model: e.target.value },
                  })
                }
                placeholder="gpt-4"
                required
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Input
                label="Temperature"
                type="number"
                step="0.1"
                min="0"
                max="2"
                value={formData.provider.temperature}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    provider: {
                      ...formData.provider,
                      temperature: Number.parseFloat(e.target.value),
                    },
                  })
                }
              />

              <Input
                label="Max Tokens (optional)"
                type="number"
                value={formData.provider.maxTokens || ""}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    provider: {
                      ...formData.provider,
                      maxTokens: e.target.value
                        ? Number.parseInt(e.target.value, 10)
                        : undefined,
                    },
                  })
                }
                placeholder="4096"
              />
            </div>

            <Input
              label="Tools (comma-separated)"
              value={formData.tools?.join(", ") || ""}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  tools: e.target.value
                    .split(",")
                    .map((tool) => tool.trim())
                    .filter(Boolean),
                })
              }
              placeholder="echo, calculator"
            />

            <div className="flex gap-2">
              <Button type="submit" loading={createAgent.isPending}>
                Create Agent
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => navigate("/agents")}
              >
                Cancel
              </Button>
            </div>
          </div>
        </Card>
      </form>
    </div>
  );
}
