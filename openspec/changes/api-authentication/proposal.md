# API Authentication and Authorization

## Problem Statement

Senclaw's REST API is currently open to anyone with network access. This creates security risks:
- **No access control**: Anyone can create/delete agents, submit tasks
- **No audit trail**: Cannot track who performed which actions
- **No rate limiting**: Vulnerable to abuse and DoS attacks
- **No multi-tenancy**: Cannot isolate different users or teams

## Proposed Solution

Implement API key-based authentication with role-based access control (RBAC):

1. **API Keys**: Generate and manage API keys for users/applications
2. **Authentication Middleware**: Validate API keys on every request
3. **Authorization**: Enforce permissions based on roles (admin, user, readonly)
4. **Rate Limiting**: Per-key request limits to prevent abuse
5. **Audit Logging**: Track all authenticated requests

### Core Capabilities

- **API Key Management**
  - Generate keys with configurable expiration
  - Revoke keys immediately
  - List active keys with metadata (name, created, last used)
  - Rotate keys without downtime

- **Authentication**
  - Header-based: `Authorization: Bearer <api-key>`
  - Query parameter fallback: `?api_key=<key>` (for webhooks)
  - Validate key format, check expiration, verify signature

- **Authorization (RBAC)**
  - **Admin**: Full access (create/delete agents, manage keys)
  - **User**: Create agents, submit tasks, view own resources
  - **Readonly**: View agents and runs only

- **Rate Limiting**
  - Per-key limits: 100 req/min (user), 1000 req/min (admin)
  - Return `429 Too Many Requests` with `Retry-After` header
  - Sliding window algorithm

- **Audit Logging**
  - Log every authenticated request: timestamp, key ID, endpoint, status
  - Store in `audit_logs` table for compliance

### Technology Stack

- **Key Storage**: SQLite (encrypted keys with bcrypt)
- **Middleware**: Fastify hooks (preHandler)
- **Rate Limiting**: `@fastify/rate-limit` plugin
- **Crypto**: Node.js `crypto` module for key generation

## Success Criteria

1. All API endpoints require valid API key (except `/health`)
2. Invalid/expired keys return `401 Unauthorized`
3. Insufficient permissions return `403 Forbidden`
4. Rate limits enforced per key
5. Audit logs queryable via admin API

## Non-Goals

- **OAuth/OIDC**: Deferred to enterprise features
- **JWT tokens**: API keys sufficient for v1
- **Fine-grained permissions**: Role-based only, no resource-level ACLs
- **Multi-tenancy**: Single-tenant with multiple keys

## Dependencies

- `persistent-storage` (for keys and audit logs)

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Key leakage | High | Short expiration, easy revocation, audit logs |
| Brute force attacks | Medium | Rate limiting, key format validation |
| Performance overhead | Low | Cache key lookups, use indexes |

## Timeline: 4-6 days
