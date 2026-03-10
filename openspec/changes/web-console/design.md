# Web Console — Design Document

## Overview

The Web Console is a React-based single-page application that provides a visual interface for all Senclaw operations. It consumes the existing REST API and runs as a static asset bundle served by the gateway.

## Architecture

### High-Level Structure

```
┌─────────────────────────────────────────────────────────┐
│                    Browser (Client)                      │
│  ┌───────────────────────────────────────────────────┐  │
│  │           React SPA (apps/web)                    │  │
│  │  ┌─────────────┐  ┌──────────────┐  ┌─────────┐ │  │
│  │  │   Routes    │  │  Components  │  │  Hooks  │ │  │
│  │  │ (React      │  │  (UI Layer)  │  │ (State) │ │  │
│  │  │  Router)    │  │              │  │         │ │  │
│  │  └─────────────┘  └──────────────┘  └─────────┘ │  │
│  │         │                 │                │      │  │
│  │         └─────────────────┴────────────────┘      │  │
│  │                          │                         │  │
│  │                  ┌───────▼────────┐               │  │
│  │                  │  API Client    │               │  │
│  │                  │  (fetch + TQ)  │               │  │
│  │                  └───────┬────────┘               │  │
│  └──────────────────────────┼──────────────────────────┘
│                              │ HTTP/JSON                 │
└──────────────────────────────┼───────────────────────────┘
                               │
┌──────────────────────────────▼───────────────────────────┐
│                  Gateway (apps/gateway)                   │
│  ┌────────────────────────────────────────────────────┐  │
│  │  Static File Serving (Fastify)                     │  │
│  │  GET /          → index.html                       │  │
│  │  GET /assets/*  → JS/CSS bundles                   │  │
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │  REST API Routes                                   │  │
│  │  /api/v1/agents, /api/v1/tasks, /api/v1/runs      │  │
│  └────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────┘
```

### Directory Structure

```
apps/web/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── index.html                    ← Entry HTML
├── public/                       ← Static assets (favicon, etc.)
├── src/
│   ├── main.tsx                  ← React root, router setup
│   ├── App.tsx                   ← Root component, layout
│   ├── routes/                   ← Page components
│   │   ├── agents/
│   │   │   ├── AgentListPage.tsx
│   │   │   ├── AgentDetailPage.tsx
│   │   │   └── AgentCreatePage.tsx
│   │   ├── runs/
│   │   │   ├── RunListPage.tsx
│   │   │   └── RunDetailPage.tsx
│   │   ├── tasks/
│   │   │   └── TaskSubmitPage.tsx
│   │   └── HealthPage.tsx
│   ├── components/               ← Reusable UI components
│   │   ├── ui/                   ← Base components (Button, Card, etc.)
│   │   ├── AgentCard.tsx
│   │   ├── RunStatusBadge.tsx
│   │   ├── MessageList.tsx
│   │   └── HealthIndicator.tsx
│   ├── lib/                      ← Utilities and API client
│   │   ├── api.ts                ← Typed API client
│   │   ├── queries.ts            ← TanStack Query hooks
│   │   └── utils.ts              ← Helper functions
│   ├── types/                    ← TypeScript types (re-export from protocol)
│   │   └── index.ts
│   └── styles/
│       └── globals.css           ← Tailwind imports, custom styles
└── tests/
    └── *.test.tsx                ← Component tests
```

## Technology Choices

### React 18
- **Why**: Industry standard, excellent TypeScript support, large ecosystem
- **Alternatives considered**: Vue 3 (less TypeScript-first), Svelte (smaller ecosystem)

### Vite
- **Why**: Fast dev server (ESM-native), optimized builds, official React template
- **Alternatives considered**: Create React App (deprecated), Next.js (overkill for SPA)

### TanStack Query (React Query)
- **Why**: Declarative data fetching, automatic caching, background refetching, optimistic updates
- **Alternatives considered**: SWR (less feature-rich), Redux Toolkit Query (more boilerplate)

### Radix UI + Tailwind CSS
- **Why**: Accessible primitives (Radix), utility-first styling (Tailwind), no runtime JS for styles
- **Alternatives considered**: Material UI (heavy bundle), Chakra UI (runtime styles), shadcn/ui (considered, but Radix is the foundation)

### React Router v6
- **Why**: Standard routing solution, nested routes, data loading integration
- **Alternatives considered**: TanStack Router (too new), Wouter (too minimal)

## Component Architecture

### Page Components (Routes)

Each route is a page component that:
1. Uses TanStack Query hooks to fetch data
2. Handles loading and error states
3. Renders child components with fetched data
4. Manages local UI state (filters, modals)

Example:
```tsx
// routes/agents/AgentListPage.tsx
export function AgentListPage() {
  const { data: agents, isLoading, error } = useAgents();
  const [searchTerm, setSearchTerm] = useState('');

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorMessage error={error} />;

  const filtered = agents.filter(a =>
    a.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div>
      <SearchInput value={searchTerm} onChange={setSearchTerm} />
      <AgentGrid agents={filtered} />
    </div>
  );
}
```

### Reusable Components

- **Presentational**: Receive props, render UI, no data fetching
- **Composable**: Small, single-purpose, easy to test
- **Accessible**: Use Radix primitives, semantic HTML, ARIA attributes

Example:
```tsx
// components/RunStatusBadge.tsx
export function RunStatusBadge({ status }: { status: RunStatus }) {
  const variants = {
    pending: 'bg-gray-200 text-gray-800',
    running: 'bg-blue-200 text-blue-800',
    completed: 'bg-green-200 text-green-800',
    failed: 'bg-red-200 text-red-800',
  };

  return (
    <span className={`px-2 py-1 rounded text-sm ${variants[status]}`}>
      {status}
    </span>
  );
}
```

## API Client Design

### Typed Fetch Wrapper

```typescript
// lib/api.ts
import type { Agent, CreateAgent, Run, Task, Message } from '@senclaw/protocol';

const API_BASE = '/api/v1';

async function fetchJSON<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(error.message || 'Request failed');
  }

  return response.json();
}

export const api = {
  agents: {
    list: () => fetchJSON<Agent[]>(`${API_BASE}/agents`),
    get: (id: string) => fetchJSON<Agent>(`${API_BASE}/agents/${id}`),
    create: (data: CreateAgent) =>
      fetchJSON<Agent>(`${API_BASE}/agents`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      fetch(`${API_BASE}/agents/${id}`, { method: 'DELETE' }),
  },
  tasks: {
    submit: (task: Task) =>
      fetchJSON<Run>(`${API_BASE}/tasks`, {
        method: 'POST',
        body: JSON.stringify(task),
      }),
  },
  runs: {
    get: (id: string) => fetchJSON<Run>(`${API_BASE}/runs/${id}`),
    getMessages: (id: string) => fetchJSON<Message[]>(`${API_BASE}/runs/${id}/messages`),
  },
  health: {
    check: () => fetchJSON<{ status: string; details?: unknown }>('/health'),
  },
};
```

### TanStack Query Hooks

```typescript
// lib/queries.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

export function useAgents() {
  return useQuery({
    queryKey: ['agents'],
    queryFn: api.agents.list,
  });
}

export function useAgent(id: string) {
  return useQuery({
    queryKey: ['agents', id],
    queryFn: () => api.agents.get(id),
    enabled: !!id,
  });
}

export function useCreateAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.agents.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
    },
  });
}

export function useRun(id: string, options?: { refetchInterval?: number }) {
  return useQuery({
    queryKey: ['runs', id],
    queryFn: () => api.runs.get(id),
    enabled: !!id,
    refetchInterval: options?.refetchInterval,
  });
}

export function useRunMessages(runId: string) {
  return useQuery({
    queryKey: ['runs', runId, 'messages'],
    queryFn: () => api.runs.getMessages(runId),
    enabled: !!runId,
  });
}
```

## State Management Strategy

### Server State (TanStack Query)
- Agent list, agent details
- Run list, run details, run messages
- Health check status

**Caching Strategy**:
- Agents: Cache indefinitely, invalidate on mutation
- Runs: Cache for 30s, auto-refetch if status is `pending` or `running`
- Messages: Cache for 1 minute, refetch on demand

### Local UI State (React useState/useReducer)
- Search filters, sort order
- Modal open/closed state
- Form input values
- Selected items

### URL State (React Router)
- Current page/route
- Agent ID, Run ID (route params)
- Query parameters (filters, pagination)

## Real-Time Updates

### Phase 1: Polling (Initial Implementation)

For runs with status `pending` or `running`, enable automatic refetching:

```typescript
export function useRun(id: string) {
  const { data: run } = useQuery({
    queryKey: ['runs', id],
    queryFn: () => api.runs.get(id),
    refetchInterval: (data) => {
      // Poll every 2s if run is active, otherwise stop
      return data?.status === 'pending' || data?.status === 'running'
        ? 2000
        : false;
    },
  });
  return run;
}
```

### Phase 2: Server-Sent Events (Future Enhancement)

Add SSE endpoint to gateway:
```
GET /api/v1/runs/:id/stream
```

Update hook to use EventSource:
```typescript
useEffect(() => {
  const eventSource = new EventSource(`/api/v1/runs/${id}/stream`);
  eventSource.onmessage = (event) => {
    const run = JSON.parse(event.data);
    queryClient.setQueryData(['runs', id], run);
  };
  return () => eventSource.close();
}, [id]);
```

## Styling and Theming

### Tailwind Configuration

```typescript
// tailwind.config.ts
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: { /* brand colors */ },
        status: {
          pending: '#6B7280',
          running: '#3B82F6',
          completed: '#10B981',
          failed: '#EF4444',
        },
      },
    },
  },
  plugins: [],
};
```

### Dark Mode

Use CSS variables + `prefers-color-scheme`:

```css
/* globals.css */
:root {
  --bg-primary: #ffffff;
  --text-primary: #111827;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg-primary: #111827;
    --text-primary: #f9fafb;
  }
}
```

## Accessibility

### Requirements
- Keyboard navigation for all interactive elements
- Focus indicators (visible outline)
- ARIA labels for icon buttons
- Semantic HTML (`<nav>`, `<main>`, `<article>`)
- Color contrast ratio ≥ 4.5:1 (WCAG AA)

### Testing
- Automated: `@axe-core/react` in development
- Manual: Screen reader testing (NVDA on Windows, VoiceOver on macOS)

## Performance Optimization

### Code Splitting
```typescript
// Lazy load route components
const AgentListPage = lazy(() => import('./routes/agents/AgentListPage'));
const RunDetailPage = lazy(() => import('./routes/runs/RunDetailPage'));
```

### Bundle Size Targets
- Initial JS bundle: < 150 KB gzipped
- Total page weight: < 500 KB
- Time to Interactive: < 3s on 3G

### Optimization Techniques
- Tree-shaking (Vite default)
- Dynamic imports for routes
- Image optimization (WebP, lazy loading)
- Minimize third-party dependencies

## Error Handling

### API Errors
```typescript
function ErrorMessage({ error }: { error: Error }) {
  return (
    <div className="bg-red-50 border border-red-200 rounded p-4">
      <h3 className="text-red-800 font-semibold">Error</h3>
      <p className="text-red-700">{error.message}</p>
    </div>
  );
}
```

### Network Failures
- Show retry button
- Display last successful data with "stale" indicator
- Offline detection with banner

### Form Validation
- Client-side validation with Zod (reuse `@senclaw/protocol` schemas)
- Display field-level errors
- Disable submit button until valid

## Testing Strategy

### Unit Tests (Vitest + React Testing Library)
- Component rendering
- User interactions (click, type)
- Conditional rendering (loading, error states)

### Integration Tests
- Full page flows (create agent → submit task → view run)
- API mocking with MSW (Mock Service Worker)

### E2E Tests (Future)
- Playwright for critical user journeys
- Run against real backend in CI

## Build and Deployment

### Development
```bash
cd apps/web
pnpm dev  # Vite dev server on port 5173, proxies /api to gateway
```

### Production Build
```bash
pnpm build  # Output to apps/web/dist/
```

### Gateway Integration

Update `apps/gateway/src/server.ts`:
```typescript
import { fastifyStatic } from '@fastify/static';
import { join } from 'node:path';

// Serve static files from web build
await app.register(fastifyStatic, {
  root: join(__dirname, '../../web/dist'),
  prefix: '/',
});

// SPA fallback: serve index.html for non-API routes
app.setNotFoundHandler((request, reply) => {
  if (request.url.startsWith('/api') || request.url.startsWith('/health')) {
    reply.status(404).send({ error: 'NOT_FOUND' });
  } else {
    reply.sendFile('index.html');
  }
});
```

## Migration Plan

### Phase 1: Scaffold (Day 1-2)
1. Create `apps/web` with Vite + React + TypeScript template
2. Add dependencies (React Router, TanStack Query, Tailwind, Radix)
3. Set up routing structure and layout
4. Implement API client and query hooks
5. Add static file serving to gateway

### Phase 2: Agent Management (Day 3-4)
1. Agent list page with search
2. Agent detail page
3. Agent create form with validation
4. Agent delete with confirmation

### Phase 3: Task & Run Management (Day 5-6)
1. Task submit page
2. Run list page with status filters
3. Run detail page with polling
4. Message history component

### Phase 4: Polish & Testing (Day 7-8)
1. Health dashboard
2. Dark mode support
3. Error boundaries
4. Loading skeletons
5. Unit tests for key components
6. Documentation

## Open Issues

1. **Should we support agent editing?**
   - **Decision needed**: Edit form complexity vs. delete-and-recreate workflow
   - **Recommendation**: Defer to v2, start with read-only detail view

2. **Pagination for large agent/run lists?**
   - **Decision needed**: Client-side pagination (fetch all) vs. server-side (API changes)
   - **Recommendation**: Client-side for v1 (< 1000 items), add server pagination later

3. **Export run history (JSON/CSV)?**
   - **Decision needed**: Feature priority
   - **Recommendation**: Defer to v2, focus on core CRUD first

4. **Keyboard shortcuts (e.g., `/` to focus search)?**
   - **Decision needed**: Nice-to-have vs. essential
   - **Recommendation**: Add if time permits, not blocking for v1
