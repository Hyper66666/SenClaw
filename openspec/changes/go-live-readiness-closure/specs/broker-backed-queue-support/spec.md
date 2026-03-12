## ADDED Requirements

### Requirement: RabbitMQ and Redis support SHALL require concrete production drivers
Senclaw SHALL NOT claim RabbitMQ or Redis queue support as production-ready until concrete drivers implement the `QueueDriver` contract for those brokers.

#### Scenario: Broker-backed queue support is claimed
- **WHEN** Senclaw documentation or release notes claim RabbitMQ or Redis queue support
- **THEN** the repository SHALL contain concrete broker drivers rather than only an abstract queue interface or in-memory test double

### Requirement: Broker-backed queue support SHALL include recovery and delivery controls
Senclaw queue drivers SHALL support reconnect or subscription recovery, message acknowledgement behavior, retry handling, dead-letter integration points, and queue health observability.

#### Scenario: Broker connection is interrupted
- **WHEN** a transient broker disconnect occurs
- **THEN** the queue driver SHALL attempt to recover subscriptions according to documented behavior and SHALL emit logs or metrics that expose the interruption and recovery state

#### Scenario: Queue message processing fails
- **WHEN** queue event processing fails after a message is consumed
- **THEN** the queue driver SHALL apply documented ack, nack, retry, and dead-letter behavior instead of dropping the failure silently

### Requirement: Broker-backed queue claims SHALL be supported by live-broker validation
Senclaw SHALL validate RabbitMQ and Redis queue support against real broker instances before those claims are treated as release-ready.

#### Scenario: Queue driver verification is recorded
- **WHEN** RabbitMQ or Redis support is marked complete
- **THEN** the verification evidence SHALL include broker-backed lifecycle checks for startup, recovery, and message processing
