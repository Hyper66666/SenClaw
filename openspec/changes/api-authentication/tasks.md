## 1. Storage Schema

- [x] 1.1 Add `api_keys` table: id, key_hash, name, role, created_by, created_at, expires_at, last_used_at, revoked_at.
- [x] 1.2 Add `audit_logs` table: id, key_id, method, path, status, ip, user_agent, timestamp.
- [x] 1.3 Add indexes: `api_keys(key_hash)`, `audit_logs(key_id)`, `audit_logs(timestamp)`.
- [x] 1.4 Run migration.

## 2. API Key Generation

- [x] 2.1 Implement `generateApiKey()`: create random 32-byte key, prefix with `sk_`, hash with bcrypt.
- [x] 2.2 Implement `ApiKeyRepository`: create, get, list, revoke, updateLastUsed.
- [x] 2.3 Add validation: key format `sk_[a-zA-Z0-9]{43}`, expiration date in future.

## 3. Authentication Middleware

- [x] 3.1 Implement Fastify preHandler hook: extract key from `Authorization: Bearer` header or `api_key` query param.
- [x] 3.2 Validate key format, lookup in database, check expiration, check revocation.
- [x] 3.3 Return `401 Unauthorized` if invalid/expired/revoked.
- [x] 3.4 Attach key metadata to request context for authorization.
- [x] 3.5 Update `last_used_at` timestamp asynchronously.

## 4. Authorization (RBAC)

- [x] 4.1 Define role permissions: admin (all), user (agents, tasks, runs), readonly (GET only).
- [x] 4.2 Implement authorization decorator: `@RequireRole('admin')`.
- [x] 4.3 Check role in route handlers, return `403 Forbidden` if insufficient permissions.
- [x] 4.4 Exempt `/health` endpoint from authentication.

## 5. Rate Limiting

- [x] 5.1 Install `@fastify/rate-limit` plugin.
- [x] 5.2 Configure per-key limits: 100 req/min (user), 1000 req/min (admin).
- [x] 5.3 Use key ID as rate limit identifier.
- [x] 5.4 Return `429 Too Many Requests` with `Retry-After` header.

## 6. Audit Logging

- [x] 6.1 Implement Fastify onResponse hook: log every authenticated request.
- [x] 6.2 Store in `audit_logs` table: key_id, method, path, status, ip, user_agent, timestamp.
- [x] 6.3 Add cleanup job: delete logs older than 90 days.

## 7. API Key Management Routes

- [x] 7.1 POST /api/v1/keys - Create API key (admin only).
- [x] 7.2 GET /api/v1/keys - List API keys (admin only).
- [x] 7.3 DELETE /api/v1/keys/:id - Revoke API key (admin only).
- [x] 7.4 GET /api/v1/keys/:id/audit - Get audit logs for key (admin only).

## 8. Bootstrap Admin Key

- [x] 8.1 Generate initial admin key on first startup if no keys exist.
- [x] 8.2 Print key to console (one-time display).
- [x] 8.3 Store key hash in database.

## 9. Testing

- [x] 9.1 Unit tests for key generation, validation, hashing.
- [x] 9.2 Integration tests: valid key → 200, invalid key → 401, expired key → 401.
- [x] 9.3 Integration tests: admin role → access all, user role → limited access, readonly → GET only.
- [x] 9.4 Integration tests: rate limiting triggers 429 after limit exceeded.

## 10. Documentation

- [x] 10.1 Document API key format and usage.
- [x] 10.2 Add authentication examples to API docs.
- [x] 10.3 Document role permissions matrix.

## 11. Migration Guide

- [x] 11.1 Document breaking change: all endpoints now require authentication.
- [x] 11.2 Provide migration script to generate initial admin key.
- [x] 11.3 Update web console to include API key in requests.

## 12. Verification

- [x] 12.1 Start gateway, verify admin key generated and printed.
- [x] 12.2 Test API without key → 401.
- [x] 12.3 Test API with valid key → 200.
- [x] 12.4 Test rate limiting: exceed limit → 429.
- [x] 12.5 Test audit logs: verify requests logged.
