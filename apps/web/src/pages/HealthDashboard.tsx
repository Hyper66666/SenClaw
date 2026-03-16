import { Badge, Card } from "@/components/ui";
import { QueryStateBoundary } from "@/components/QueryStateBoundary";
import { useConsoleLocale } from "@/components/LocaleProvider";
import { useHealth } from "@/hooks/useAPI";
import { getHealthStatusVariant } from "@/lib/status";

function StatusIcon({ status, label }: { status: string; label: string }) {
  switch (status) {
    case "healthy":
      return (
        <svg
          className="h-6 w-6 text-green-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <title>{label}</title>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      );
    case "degraded":
      return (
        <svg
          className="h-6 w-6 text-yellow-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <title>{label}</title>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
      );
    case "unhealthy":
      return (
        <svg
          className="h-6 w-6 text-red-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <title>{label}</title>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      );
    default:
      return null;
  }
}

export function HealthDashboard() {
  const { copy, locale } = useConsoleLocale();
  const { data: health, isLoading, error, refetch } = useHealth();

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "healthy":
        return copy.health.healthy;
      case "degraded":
        return copy.health.degraded;
      case "unhealthy":
        return copy.health.unhealthy;
      default:
        return copy.health.unknown;
    }
  };

  return (
    <QueryStateBoundary
      isLoading={isLoading}
      error={error}
      locale={locale}
      onRetry={() => {
        void refetch();
      }}
    >
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">{copy.health.title}</h1>
          <p className="mt-2 text-muted-foreground">
            {copy.health.description}
          </p>
        </div>

        <Card>
          <div className="flex items-center gap-4">
            <StatusIcon
              status={health?.status || "unknown"}
              label={getStatusLabel(health?.status || "unknown")}
            />
            <div>
              <h2 className="text-xl font-semibold">
                {copy.health.overallStatus}
              </h2>
              <Badge
                variant={getHealthStatusVariant(health?.status || "default")}
                className="mt-1"
              >
                {getStatusLabel(health?.status || "unknown")}
              </Badge>
            </div>
          </div>
        </Card>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {health?.checks &&
            Object.entries(health.checks).map(([name, check]) => (
              <Card key={name}>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold capitalize">{name}</h3>
                    <StatusIcon
                      status={check.status}
                      label={getStatusLabel(check.status)}
                    />
                  </div>
                  <Badge variant={getHealthStatusVariant(check.status)}>
                    {getStatusLabel(check.status)}
                  </Badge>
                  {check.detail && (
                    <p className="text-sm text-muted-foreground">
                      {check.detail}
                    </p>
                  )}
                </div>
              </Card>
            ))}
        </div>
      </div>
    </QueryStateBoundary>
  );
}
