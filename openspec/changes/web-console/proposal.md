# Web Console

## Problem Statement

Senclaw currently provides only a REST API for agent management and task execution. Users must interact with the system through curl, Postman, or custom scripts. This creates significant friction for:

- **Developers** exploring the system and debugging agent behavior
- **Operators** monitoring active runs and investigating failures
- **Product teams** demonstrating agent capabilities to stakeholders

Without a visual interface, users cannot:
- Browse and search existing agents
- Monitor run status in real-time
- Inspect message history and tool calls
- Understand system health at a glance
- Quickly iterate on agent configurations

## Proposed Solution

Build a web-based console application that provides a modern, responsive UI for all Senclaw operations. The console will be a single-page application (SPA) served by the existing gateway, consuming the REST API endpoints already implemented.

### Core Capabilities

1. **Agent Management**
   - List all agents with search and filtering
   - View agent details (system prompt, provider config, tools)
   - Create new agents with form validation
   - Edit existing agent configurations
   - Delete agents with confirmation

2. **Task Execution**
   - Submit tasks to any agent
   - View task input and select agent from dropdown
   - Immediate feedback on task submission

3. **Run Monitoring**
   - List all runs with status badges (pending, running, completed, failed)
   - Real-time status updates without manual refresh
   - Filter runs by agent, status, or time range
   - View detailed run information (timestamps, duration, error messages)

4. **Message History**
   - Display conversation flow for any run
   - Render system, user, assistant, and tool messages distinctly
   - Show tool calls with arguments and results
   - Support JSON syntax highlighting for structured data

5. **System Health**
   - Dashboard showing gateway and storage health status
   - Visual indicators (green/yellow/red) for service health
   - Display health check details when available

### Technology Stack

- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite (fast dev server, optimized production builds)
- **Routing**: React Router v6
- **State Management**: TanStack Query (React Query) for server state
- **UI Components**: Radix UI primitives + Tailwind CSS
- **Real-time Updates**: Server-Sent Events (SSE) or polling
- **HTTP Client**: fetch API with typed wrappers

### Architecture Principles

- **API-First**: Console is a pure client of the existing REST API, no special backend logic
- **Progressive Enhancement**: Core functionality works without JavaScript (where feasible)
- **Responsive Design**: Mobile-friendly layouts, desktop-optimized workflows
- **Accessibility**: WCAG 2.1 AA compliance, keyboard navigation, screen reader support
- **Performance**: Code splitting, lazy loading, optimistic updates

## Success Criteria

1. **Functional Completeness**: All REST API operations accessible through the UI
2. **Usability**: New users can create an agent and submit a task within 2 minutes
3. **Performance**: Initial page load < 2s, route transitions < 200ms
4. **Reliability**: No console errors in production build, graceful error handling
5. **Cross-Platform**: Works on Chrome, Firefox, Safari, Edge (latest 2 versions)

## Non-Goals

- **Authentication/Authorization**: Deferred to separate API auth change set
- **Agent Template Library**: Deferred to developer experience change set
- **Advanced Analytics**: Deferred to observability enhancement change set
- **Multi-Tenancy**: Deferred to future enterprise features
- **Embedded Agent Editor**: Initial version uses textarea, rich editor deferred

## Dependencies

- **Prerequisite**: `persistent-storage` change set (for durable state across restarts)
- **Prerequisite**: Gateway API endpoints (`/api/v1/agents`, `/api/v1/tasks`, `/api/v1/runs`, `/health`)
- **Optional Enhancement**: Real-time updates via SSE (can start with polling)

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Framework churn (React ecosystem changes) | Medium | Pin major versions, use stable APIs, avoid experimental features |
| Build complexity (Vite + TypeScript + Tailwind) | Low | Use official templates, document build process, add CI checks |
| Real-time updates add backend complexity | Medium | Start with polling (simple), add SSE as enhancement (non-breaking) |
| Accessibility compliance requires expertise | High | Use Radix UI (accessible by default), add automated a11y tests, manual review |
| Mobile UX differs significantly from desktop | Medium | Design mobile-first, test on real devices, use responsive breakpoints |

## Timeline Estimate

- **Phase 1** (Scaffold + Agent Management): 2-3 days
- **Phase 2** (Task Execution + Run Monitoring): 2-3 days
- **Phase 3** (Message History + Polish): 2-3 days
- **Phase 4** (Testing + Documentation): 1-2 days

**Total**: 7-11 days for a single developer

## Open Questions

1. Should the console be served at `/` (root) or `/console`?
   - **Recommendation**: Serve at `/` (root), API remains at `/api/v1/*`, health at `/health`

2. Should we support dark mode in the initial release?
   - **Recommendation**: Yes, use CSS variables and `prefers-color-scheme`, minimal overhead

3. How should we handle long-running runs (hours/days)?
   - **Recommendation**: Polling with exponential backoff, show "last updated" timestamp

4. Should we persist UI state (filters, sort order) in localStorage?
   - **Recommendation**: Yes for filters/sort, no for sensitive data (agent configs)

5. What's the strategy for API versioning (when `/api/v2` is introduced)?
   - **Recommendation**: Console always targets latest API version, no backward compatibility in UI
