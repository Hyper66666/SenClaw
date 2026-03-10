## 1. Storage Schema

- [ ] 1.1 Add `connectors` table: id, type (webhook/queue/poll), config (JSON), agent_id, enabled.
- [ ] 1.2 Add `connector_events` table: id, connector_id, payload (JSON), status, processed_at, run_id.
- [ ] 1.3 Run migration.

## 2. Connector Types

- [ ] 2.1 Implement `WebhookConnector`: HTTP POST endpoint, validate signature, extract payload.
- [ ] 2.2 Implement `QueueConnector`: subscribe to queue, consume messages, ack/nack.
- [ ] 2.3 Implement `PollingConnector`: periodic HTTP GET, compare with previous state, detect changes.

## 3. Event Processing

- [ ] 3.1 Implement event transformation: JSONPath extraction, template rendering.
- [ ] 3.2 Submit task to agent via AgentService.
- [ ] 3.3 Record event in `connector_events` table.
- [ ] 3.4 Handle failures with retry logic (max 3 retries, exponential backoff).

## 4. API Routes

- [ ] 4.1 POST /api/v1/connectors - Create connector.
- [ ] 4.2 GET /api/v1/connectors - List connectors.
- [ ] 4.3 DELETE /api/v1/connectors/:id - Delete connector.
- [ ] 4.4 GET /api/v1/connectors/:id/events - List events for connector.

## 5. Webhook Endpoint

- [ ] 5.1 POST /webhooks/:connectorId - Receive webhook, process event.
- [ ] 5.2 Validate webhook signature (HMAC, GitHub, Slack formats).
- [ ] 5.3 Return 202 Accepted immediately, process asynchronously.

## 6. Testing

- [ ] 6.1 Unit tests for each connector type.
- [ ] 6.2 Integration test: send webhook, verify task submitted.
- [ ] 6.3 Integration test: queue message, verify task submitted.

## 7. Documentation

- [ ] 7.1 Document connector configuration format.
- [ ] 7.2 Add examples for GitHub webhook, Slack webhook, RSS polling.
