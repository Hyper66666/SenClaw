import { ErrorMessage, LoadingSpinner } from "@/components/ui";
import { describeConsoleError } from "@/lib/auth-session";
import type { ConsoleLocale } from "@/lib/locale";

interface QueryStateBoundaryProps {
  isLoading: boolean;
  error?: unknown;
  locale: ConsoleLocale;
  onRetry?: () => void;
  children?: React.ReactNode;
}

export function QueryStateBoundary({
  isLoading,
  error,
  locale,
  onRetry,
  children,
}: QueryStateBoundaryProps) {
  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (error) {
    const errorState = describeConsoleError(error, locale);
    return (
      <ErrorMessage
        title={errorState.title}
        message={errorState.message}
        onRetry={onRetry}
      />
    );
  }

  return <>{children}</>;
}
