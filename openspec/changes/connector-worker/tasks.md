## 1. Storage Schema

- [x] 1.1 Add `connectors` table: id, type (webhook/queue/poll), config (JSON), agent_id, enabled.
- [x] 1.2 Add `connector_events` table: id, connector_id, payload (JSON), status, processed_at, run_id.
- [x] 1.3 Run migration.

## 2. Connector Types

- [x] 2.1 Implement `WebhookConnector`: HTTP POST endpoint, validate signature, extract payload.
- [x] 2.2 Implement `QueueConnector`: subscribe to queue, consume messages, ack/nack.
- [x] 2.3 Implement `PollingConnector`: periodic HTTP GET, compare with previous state, detect changes.

## 3. Event Processing

- [x] 3.1 Implement event transformation: JSONPath extraction, template rendering.
- [x] 3.2 Submit task to agent via AgentService.
- [x] 3.3 Record event in `connector_events` table.
- [x] 3.4 Handle failures with retry logic (max 3 retries, exponential backoff).

## 4. API Routes

- [x] 4.1 POST /api/v1/connectors - Create connector.
- [x] 4.2 GET /api/v1/connectors - List connectors.
- [x] 4.3 DELETE /api/v1/connectors/:id - Delete connector.
- [x] 4.4 GET /api/v1/connectors/:id/events - List events for connector.

## 5. Webhook Endpoint

- [x] 5.1 POST /webhooks/:connectorId - Receive webhook, process event.
- [x] 5.2 Validate webhook signature (HMAC, GitHub, Slack formats).
- [x] 5.3 Return 202 Accepted immediately, process asynchronously.

## 6. Testing

- [x] 6.1 Unit tests for each connector type.
- [x] 6.2 Integration test: send webhook, verify task submitted.
- [x] 6.3 Integration test: queue message, verify task submitted.

## 7. Documentation

- [x] 7.1 Document connector configuration format.
- [x] 7.2 Add examples for GitHub webhook, Slack webhook, RSS polling.


