## 1. Project Scaffold

- [ ] 1.1 Create `apps/web` directory with Vite + React + TypeScript template using `pnpm create vite`.
- [ ] 1.2 Add dependencies: `react-router-dom`, `@tanstack/react-query`, `tailwindcss`, `@radix-ui/react-*` primitives.
- [ ] 1.3 Configure Tailwind CSS with dark mode support (`class` strategy) and custom color palette.
- [ ] 1.4 Set up `tsconfig.json` extending workspace base, add path aliases (`@/` → `src/`).
- [ ] 1.5 Configure Vite dev server to proxy `/api` and `/health` to gateway (port 4100).
- [ ] 1.6 Add `apps/web` to workspace references in `tsconfig.workspace.json`.
- [ ] 1.7 Update root `package.json` to add `dev:web` script (`pnpm --filter @senclaw/web dev`).

## 2. Base UI Components

- [ ] 2.1 Implement `Button` component with variants (primary, secondary, ghost, danger) and loading state.
- [ ] 2.2 Implement `Card` component with optional title and actions slot.
- [ ] 2.3 Implement `Input` component with label, error state, and validation feedback.
- [ ] 2.4 Implement `Textarea` component for multi-line input.
- [ ] 2.5 Implement `Select` component using Radix UI Select primitive.
- [ ] 2.6 Implement `Badge` component with color variants.
- [ ] 2.7 Implement `LoadingSpinner` component with size variants.
- [ ] 2.8 Implement `ErrorMessage` component with retry action.
- [ ] 2.9 Implement `EmptyState` component with icon, title, description, and action.
- [ ] 2.10 Add unit tests for all base components (render, props, interactions).

## 3. API Client and Query Hooks

- [ ] 3.1 Implement `fetchJSON` wrapper with timeout, error handling, and typed responses.
- [ ] 3.2 Define `APIError` class with status, code, and details fields.
- [ ] 3.3 Implement `agentAPI` methods: `list()`, `get(id)`, `create(data)`, `delete(id)`.
- [ ] 3.4 Implement `taskAPI.submit(task)` method.
- [ ] 3.5 Implement `runAPI` methods: `get(id)`, `getMessages(id)`.
- [ ] 3.6 Implement `healthAPI.check()` method.
- [ ] 3.7 Set up TanStack Query client with default options (staleTime, retry, refetchOnWindowFocus).
- [ ] 3.8 Implement `useAgents()`, `useAgent(id)`, `useCreateAgent()`, `useDeleteAgent()` hooks.
- [ ] 3.9 Implement `useRun(id)` hook with automatic polling for active runs.
- [ ] 3.10 Implement `useRunMessages(runId)` hook.
- [ ] 3.11 Implement `useSubmitTask()` hook.
- [ ] 3.12 Implement `useHealth()` hook with 30s refetch interval.
- [ ] 3.13 Add optimistic updates for agent create and delete mutations.
- [ ] 3.14 Add unit tests for API client methods and query hooks.

## 4. Routing and Layout

- [ ] 4.1 Set up React Router with routes: `/` (agents list), `/agents/:id` (detail), `/agents/new` (create), `/runs` (list), `/runs/:id` (detail), `/tasks/new` (submit), `/health` (dashboard).
- [ ] 4.2 Implement `AppLayout` component with header, navigation, and content area.
- [ ] 4.3 Add navigation links in header: Agents, Runs, Tasks, Health.
- [ ] 4.4 Implement `PageHeader` component for page title and actions.
- [ ] 4.5 Add dark mode toggle button in header using `prefers-color-scheme` and localStorage.
- [ ] 4.6 Implement `ErrorBoundary` component to catch React errors.
- [ ] 4.7 Add 404 Not Found page for unknown routes.

## 5. Agent Management Pages

- [ ] 5.1 Implement `AgentListPage`: fetch agents with `useAgents()`, display in grid layout.
- [ ] 5.2 Add search input to filter agents by name (client-side filtering).
- [ ] 5.3 Implement `AgentCard` component with agent name, provider, tools count, and actions menu.
- [ ] 5.4 Add "Create Agent" button in page header, navigates to `/agents/new`.
- [ ] 5.5 Implement `AgentDetailPage`: fetch agent with `useAgent(id)`, display full details.
- [ ] 5.6 Show agent system prompt in expandable/collapsible section.
- [ ] 5.7 Display provider config (provider name, model) in formatted layout.
- [ ] 5.8 List agent tools with badges.
- [ ] 5.9 Add "Delete Agent" button with confirmation dialog (Radix UI AlertDialog).
- [ ] 5.10 Implement `AgentCreatePage` with form: name (input), system prompt (textarea), provider (select), model (input), tools (multi-select or comma-separated input).
- [ ] 5.11 Add client-side validation using Zod (reuse `CreateAgentSchema` from `@senclaw/protocol`).
- [ ] 5.12 Display validation errors inline for each field.
- [ ] 5.13 Handle form submission with `useCreateAgent()`, show loading state, navigate to detail page on success.
- [ ] 5.14 Add error handling for API failures (show toast or error message).

## 6. Task Submission Page

- [ ] 6.1 Implement `TaskSubmitPage` with form: agent selector (dropdown), task input (textarea).
- [ ] 6.2 Fetch agents with `useAgents()` to populate dropdown.
- [ ] 6.3 Add validation: agent must be selected, input must not be empty.
- [ ] 6.4 Handle form submission with `useSubmitTask()`, show loading state.
- [ ] 6.5 Navigate to `/runs/:id` on successful task submission.
- [ ] 6.6 Display error message if submission fails.

## 7. Run Monitoring Pages

- [ ] 7.1 Implement `RunListPage`: fetch runs (initially from cache, later add API endpoint for list).
- [ ] 7.2 Display runs in table layout with columns: Run ID, Agent Name, Status, Created At, Duration.
- [ ] 7.3 Implement `RunStatusBadge` component with color coding and icons.
- [ ] 7.4 Add status filter dropdown (All, Pending, Running, Completed, Failed).
- [ ] 7.5 Add client-side filtering by status.
- [ ] 7.6 Make each row clickable, navigates to `/runs/:id`.
- [ ] 7.7 Implement `RunDetailPage`: fetch run with `useRun(id)`, display status, timestamps, error (if failed).
- [ ] 7.8 Show run duration (calculated from createdAt and updatedAt).
- [ ] 7.9 Add "View Messages" button that scrolls to message history section.
- [ ] 7.10 Fetch messages with `useRunMessages(runId)`, display in `MessageList` component.
- [ ] 7.11 Implement `MessageList` component: render system, user, assistant, tool messages with distinct styling.
- [ ] 7.12 Render tool calls with formatted JSON (syntax highlighting using `<pre>` and CSS).
- [ ] 7.13 Add auto-scroll to latest message when new messages arrive.
- [ ] 7.14 Show "Run is active, updates every 2s" indicator when status is pending/running.

## 8. Health Dashboard Page

- [ ] 8.1 Implement `HealthPage`: fetch health status with `useHealth()`.
- [ ] 8.2 Display overall system status with large `HealthIndicator` component.
- [ ] 8.3 Show individual service health (gateway, storage) if `details` are present.
- [ ] 8.4 Display last checked timestamp.
- [ ] 8.5 Add "Refresh" button to manually trigger health check.
- [ ] 8.6 Show error message if health check fails.

## 9. Domain Components

- [ ] 9.1 Implement `AgentCard` component (used in list page).
- [ ] 9.2 Implement `RunStatusBadge` component with animated pulse for "running" status.
- [ ] 9.3 Implement `MessageList` component with message type detection and rendering.
- [ ] 9.4 Implement `HealthIndicator` component with status dot and label.
- [ ] 9.5 Add unit tests for all domain components.

## 10. Gateway Integration

- [ ] 10.1 Install `@fastify/static` in `apps/gateway`.
- [ ] 10.2 Update `apps/gateway/src/server.ts` to serve static files from `apps/web/dist`.
- [ ] 10.3 Add SPA fallback: serve `index.html` for non-API routes (routes not starting with `/api` or `/health`).
- [ ] 10.4 Update gateway build process to include web build: add `pnpm --filter @senclaw/web build` before gateway build.
- [ ] 10.5 Test that gateway serves web console at `http://localhost:4100/` and API at `http://localhost:4100/api/v1/*`.

## 11. Styling and Theming

- [ ] 11.1 Define CSS variables for colors in `globals.css` (light and dark mode).
- [ ] 11.2 Configure Tailwind to use CSS variables for theme colors.
- [ ] 11.3 Add dark mode toggle logic: read `prefers-color-scheme`, allow manual override, persist in localStorage.
- [ ] 11.4 Test all components in both light and dark modes.
- [ ] 11.5 Verify color contrast ratios meet WCAG AA standards (use Chrome DevTools Lighthouse).

## 12. Accessibility

- [ ] 12.1 Add `aria-label` to all icon buttons.
- [ ] 12.2 Ensure all form inputs have associated `<label>` elements.
- [ ] 12.3 Add keyboard navigation support: Tab, Enter, Escape for modals/dialogs.
- [ ] 12.4 Implement focus trap in modals using Radix UI Dialog.
- [ ] 12.5 Add visible focus indicators (2px blue outline) for all interactive elements.
- [ ] 12.6 Test with keyboard-only navigation (no mouse).
- [ ] 12.7 Install `@axe-core/react` and run automated accessibility checks in development.
- [ ] 12.8 Manually test with screen reader (NVDA on Windows or VoiceOver on macOS).

## 13. Performance Optimization

- [ ] 13.1 Add code splitting for route components using `React.lazy()` and `Suspense`.
- [ ] 13.2 Measure bundle size with `vite build --mode production` and ensure initial bundle < 150 KB gzipped.
- [ ] 13.3 Add loading skeletons for data-fetching components (instead of spinners).
- [ ] 13.4 Optimize images: use WebP format, add lazy loading with `loading="lazy"`.
- [ ] 13.5 Run Lighthouse audit and achieve score > 90 for Performance, Accessibility, Best Practices.

## 14. Error Handling

- [ ] 14.1 Implement global error boundary to catch React errors.
- [ ] 14.2 Add error handling for all API calls (display `ErrorMessage` component).
- [ ] 14.3 Show retry button for transient errors (network failures, timeouts).
- [ ] 14.4 Display validation errors inline for form fields.
- [ ] 14.5 Add toast notifications for success/error feedback (use Radix UI Toast or simple custom implementation).

## 15. Testing

- [ ] 15.1 Set up Vitest for unit tests with React Testing Library.
- [ ] 15.2 Add unit tests for all base components (Button, Card, Input, etc.).
- [ ] 15.3 Add unit tests for domain components (AgentCard, RunStatusBadge, MessageList).
- [ ] 15.4 Add unit tests for API client methods (mock fetch).
- [ ] 15.5 Add integration tests for query hooks (mock API responses with MSW).
- [ ] 15.6 Add integration tests for page components (render, fetch data, display).
- [ ] 15.7 Achieve > 80% code coverage for critical paths.

## 16. Documentation

- [ ] 16.1 Add README.md to `apps/web` with setup instructions, dev commands, build commands.
- [ ] 16.2 Document component usage with examples (consider Storybook for future).
- [ ] 16.3 Document API client usage and query hooks.
- [ ] 16.4 Add inline code comments for complex logic.
- [ ] 16.5 Update root README.md to mention web console and how to access it.

## 17. Verification

- [ ] 17.1 Run `pnpm run verify` and ensure all checks pass (lint, typecheck, tests).
- [ ] 17.2 Run `pnpm run build` and verify production build succeeds.
- [ ] 17.3 Start gateway with `pnpm dev` and verify web console loads at `http://localhost:4100/`.
- [ ] 17.4 Test full user flow: create agent → submit task → view run → view messages.
- [ ] 17.5 Test on multiple browsers (Chrome, Firefox, Safari, Edge).
- [ ] 17.6 Test responsive design on mobile viewport (Chrome DevTools device emulation).
- [ ] 17.7 Run Lighthouse audit and verify scores > 90 for all categories.
- [ ] 17.8 Verify dark mode toggle works correctly.
- [ ] 17.9 Verify keyboard navigation works for all interactive elements.
- [ ] 17.10 Verify screen reader announces content correctly (manual test).
