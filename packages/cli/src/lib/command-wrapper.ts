import { handleAPIError } from "./api.js";

export function withCLIErrorHandling<TArgs extends unknown[]>(
  handler: (...args: TArgs) => Promise<void> | void,
  onError: (error: unknown) => never = handleAPIError,
): (...args: TArgs) => Promise<void> {
  return async (...args: TArgs) => {
    try {
      await handler(...args);
    } catch (error) {
      onError(error);
    }
  };
}
