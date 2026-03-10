# API Integration Specification

## Overview

This specification defines how the Web Console integrates with the Senclaw REST API. It covers the API client implementation, TanStack Query hooks, error handling, and caching strategies.

## API Client Architecture

### Base Configuration

```typescript
// lib/api-config.ts
export const API_CONFIG = {
  baseURL: '/api/v1',
  timeout: 30000, // 30 seconds
  headers: {
    'Content-Type': 'application/json',
  },
};
```

### Fetch Wrapper

```typescript
// lib/fetch-wrapper.ts
export class APIError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'APIError';
  }
}

export async function fetchJSON<T>(
  url: string,
  options?: RequestInit
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_CONFIG.timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        ...API_CONFIG.headers,
        ...options?.headers,
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new APIError(
        errorData.message || response.statusText,
        response.status,
        errorData.error,
        errorData.details
      );
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return undefined as T;
    }

    return response.json();
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof APIError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new APIError('Request timeout', 408);
    }
    throw new APIError('Network error', 0);
  }
}
```

## API Client Methods

### Agent Operations

```typescript
// lib/api.ts
import type { Agent, CreateAgent } from '@senclaw/protocol';

export const agentAPI = {
  /**
   * List all agents
   * GET /api/v1/agents
   */
  list: (): Promise<Agent[]> => {
    return fetchJSON(`${API_CONFIG.baseURL}/agents`);
  },

  /**
   * Get agent by ID
   * GET /api/v1/agents/:id
   */
  get: (id: string): Promise<Agent> => {
    return fetchJSON(`${API_CONFIG.baseURL}/agents/${id}`);
  },

  /**
   * Create new agent
   * POST /api/v1/agents
   */
  create: (data: CreateAgent): Promise<Agent> => {
    return fetchJSON(`${API_CONFIG.baseURL}/agents`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Delete agent
   * DELETE /api/v1/agents/:id
   */
  delete: (id: string): Promise<void> => {
    return fetchJSON(`${API_CONFIG.baseURL}/agents/${id}`, {
      method: 'DELETE',
    });
  },
};
```

### Task Operations

```typescript
import type { Task, Run } from '@senclaw/protocol';

export const taskAPI = {
  /**
   * Submit task to agent
   * POST /api/v1/tasks
   */
  submit: (task: Task): Promise<Run> => {
    return fetchJSON(`${API_CONFIG.baseURL}/tasks`, {
      method: 'POST',
      body: JSON.stringify(task),
    });
  },
};
```

### Run Operations

```typescript
import type { Run, Message } from '@senclaw/protocol';

export const runAPI = {
  /**
   * Get run by ID
   * GET /api/v1/runs/:id
   */
  get: (id: string): Promise<Run> => {
    return fetchJSON(`${API_CONFIG.baseURL}/runs/${id}`);
  },

  /**
   * Get run messages
   * GET /api/v1/runs/:id/messages
   */
  getMessages: (id: string): Promise<Message[]> => {
    return fetchJSON(`${API_CONFIG.baseURL}/runs/${id}/messages`);
  },
};
```

### Health Check

```typescript
export interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  details?: Record<string, { status: string; detail?: string }>;
}

export const healthAPI = {
  /**
   * Check system health
   * GET /health
   */
  check: (): Promise<HealthResponse> => {
    return fetchJSON('/health');
  },
};
```

## TanStack Query Integration

### Query Client Setup

```typescript
// lib/query-client.ts
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000, // 30 seconds
      retry: 3,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 1,
    },
  },
});
```

### Query Hooks

#### Agent Queries

```typescript
// lib/queries/agents.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { agentAPI } from '../api';

export const agentKeys = {
  all: ['agents'] as const,
  lists: () => [...agentKeys.all, 'list'] as const,
  list: (filters?: unknown) => [...agentKeys.lists(), filters] as const,
  details: () => [...agentKeys.all, 'detail'] as const,
  detail: (id: string) => [...agentKeys.details(), id] as const,
};

export function useAgents() {
  return useQuery({
    queryKey: agentKeys.lists(),
    queryFn: agentAPI.list,
  });
}

export function useAgent(id: string) {
  return useQuery({
    queryKey: agentKeys.detail(id),
    queryFn: () => agentAPI.get(id),
    enabled: !!id,
  });
}

export function useCreateAgent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: agentAPI.create,
    onSuccess: (newAgent) => {
      // Invalidate list query
      queryClient.invalidateQueries({ queryKey: agentKeys.lists() });
      // Optimistically add to cache
      queryClient.setQueryData(agentKeys.detail(newAgent.id), newAgent);
    },
  });
}

export function useDeleteAgent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: agentAPI.delete,
    onSuccess: (_, deletedId) => {
      // Remove from cache
      queryClient.removeQueries({ queryKey: agentKeys.detail(deletedId) });
      // Invalidate list
      queryClient.invalidateQueries({ queryKey: agentKeys.lists() });
    },
  });
}
```

#### Run Queries

```typescript
// lib/queries/runs.ts
import { useQuery, useMutation } from '@tanstack/react-query';
import { runAPI, taskAPI } from '../api';
import type { RunStatus } from '@senclaw/protocol';

export const runKeys = {
  all: ['runs'] as const,
  details: () => [...runKeys.all, 'detail'] as const,
  detail: (id: string) => [...runKeys.details(), id] as const,
  messages: (id: string) => [...runKeys.detail(id), 'messages'] as const,
};

export function useRun(id: string) {
  return useQuery({
    queryKey: runKeys.detail(id),
    queryFn: () => runAPI.get(id),
    enabled: !!id,
    refetchInterval: (data) => {
      // Poll every 2s if run is active
      const activeStatuses: RunStatus[] = ['pending', 'running'];
      return data && activeStatuses.includes(data.status) ? 2000 : false;
    },
  });
}

export function useRunMessages(runId: string) {
  return useQuery({
    queryKey: runKeys.messages(runId),
    queryFn: () => runAPI.getMessages(runId),
    enabled: !!runId,
    // Refetch messages when run status changes
    refetchInterval: (data, query) => {
      const run = query.state.data;
      return run?.status === 'running' ? 2000 : false;
    },
  });
}

export function useSubmitTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: taskAPI.submit,
    onSuccess: (run) => {
      // Add run to cache
      queryClient.setQueryData(runKeys.detail(run.id), run);
    },
  });
}
```

#### Health Query

```typescript
// lib/queries/health.ts
import { useQuery } from '@tanstack/react-query';
import { healthAPI } from '../api';

export function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: healthAPI.check,
    refetchInterval: 30_000, // Check every 30s
    retry: false, // Don't retry health checks
  });
}
```

## Caching Strategy

### Cache Invalidation Rules

| Entity | Stale Time | Invalidate On |
|--------|-----------|---------------|
| Agent list | 30s | Agent create, delete |
| Agent detail | 5 min | Agent update (future) |
| Run detail | 0s (always fresh) | Never (immutable after completion) |
| Run messages | 0s | Never (append-only) |
| Health status | 30s | Never |

### Optimistic Updates

#### Create Agent
```typescript
onMutate: async (newAgent) => {
  await queryClient.cancelQueries({ queryKey: agentKeys.lists() });
  const previous = queryClient.getQueryData(agentKeys.lists());

  queryClient.setQueryData(agentKeys.lists(), (old: Agent[] = []) => [
    ...old,
    { id: 'temp-id', ...newAgent },
  ]);

  return { previous };
},
onError: (err, newAgent, context) => {
  queryClient.setQueryData(agentKeys.lists(), context?.previous);
},
```

#### Delete Agent
```typescript
onMutate: async (id) => {
  await queryClient.cancelQueries({ queryKey: agentKeys.lists() });
  const previous = queryClient.getQueryData(agentKeys.lists());

  queryClient.setQueryData(agentKeys.lists(), (old: Agent[] = []) =>
    old.filter((agent) => agent.id !== id)
  );

  return { previous };
},
onError: (err, id, context) => {
  queryClient.setQueryData(agentKeys.lists(), context?.previous);
},
```

## Error Handling

### Error Types

```typescript
// lib/errors.ts
export function isAPIError(error: unknown): error is APIError {
  return error instanceof APIError;
}

export function getErrorMessage(error: unknown): string {
  if (isAPIError(error)) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'An unknown error occurred';
}

export function isNotFoundError(error: unknown): boolean {
  return isAPIError(error) && error.status === 404;
}

export function isValidationError(error: unknown): boolean {
  return isAPIError(error) && error.code === 'VALIDATION_ERROR';
}
```

### Error Boundaries

```typescript
// components/ErrorBoundary.tsx
export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error?: Error }
> {
  state = { hasError: false, error: undefined };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error boundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <ErrorMessage
            error={this.state.error || 'Something went wrong'}
            retry={() => window.location.reload()}
          />
        </div>
      );
    }

    return this.props.children;
  }
}
```

### Query Error Handling

```typescript
// In components
const { data, error, isLoading } = useAgents();

if (isLoading) return <LoadingSpinner />;
if (error) return <ErrorMessage error={error} retry={() => refetch()} />;
```

### Mutation Error Handling

```typescript
const { mutate, error, isPending } = useCreateAgent();

const handleSubmit = (data: CreateAgent) => {
  mutate(data, {
    onError: (error) => {
      if (isValidationError(error)) {
        // Show field-level errors
        setFieldErrors(error.details);
      } else {
        // Show toast notification
        toast.error(getErrorMessage(error));
      }
    },
    onSuccess: (agent) => {
      toast.success(`Agent "${agent.name}" created`);
      navigate(`/agents/${agent.id}`);
    },
  });
};
```

## Request Deduplication

TanStack Query automatically deduplicates identical requests:

```typescript
// Both components mount simultaneously
function ComponentA() {
  const { data } = useAgents(); // Triggers fetch
}

function ComponentB() {
  const { data } = useAgents(); // Reuses same fetch
}
```

## Background Refetching

```typescript
// Refetch stale data when window regains focus
queryClient.setDefaultOptions({
  queries: {
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  },
});
```

## Pagination (Future Enhancement)

```typescript
export function useAgentsPaginated(page: number, pageSize: number) {
  return useQuery({
    queryKey: agentKeys.list({ page, pageSize }),
    queryFn: () => agentAPI.list({ page, pageSize }),
    keepPreviousData: true, // Smooth pagination UX
  });
}
```

## Testing

### Mock API Client

```typescript
// tests/mocks/api.ts
import { vi } from 'vitest';

export const mockAgentAPI = {
  list: vi.fn(),
  get: vi.fn(),
  create: vi.fn(),
  delete: vi.fn(),
};
```

### Query Hook Tests

```typescript
// tests/queries/agents.test.ts
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { useAgents } from '@/lib/queries/agents';

describe('useAgents', () => {
  it('fetches agents successfully', async () => {
    mockAgentAPI.list.mockResolvedValue([
      { id: '1', name: 'Test Agent' },
    ]);

    const { result } = renderHook(() => useAgents(), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      ),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
  });
});
```

## Implementation Checklist

- [ ] Implement fetch wrapper with timeout and error handling
- [ ] Create API client methods for all endpoints
- [ ] Set up TanStack Query client with default options
- [ ] Implement query hooks for agents (list, get, create, delete)
- [ ] Implement query hooks for runs (get, messages)
- [ ] Implement query hook for health check
- [ ] Add optimistic updates for mutations
- [ ] Implement error boundary component
- [ ] Add error handling utilities
- [ ] Write unit tests for API client
- [ ] Write integration tests for query hooks
- [ ] Document API client usage
