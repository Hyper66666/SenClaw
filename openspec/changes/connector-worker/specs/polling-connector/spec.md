# Polling Connector Specification

## Overview

Polling connectors periodically check external data sources for changes and trigger agent tasks when new data is detected. Unlike webhooks (push) or queues (event-driven), polling uses a pull model.

## Supported Polling Types

### 1. HTTP Polling

Periodically fetch data from REST APIs or RSS feeds.

**Configuration**:
```json
{
  "type": "polling",
  "provider": "http",
  "url": "https://api.example.com/feed",
  "method": "GET",
  "headers": {
    "Authorization": "Bearer token123",
    "Accept": "application/json"
  },
  "interval": 300,
  "changeDetection": "etag",
  "itemPath": "$.items",
  "idPath": "$.id"
}
```

**Fields**:
- `url`: Endpoint to poll
- `method`: HTTP method (GET, POST)
- `headers`: Custom headers (auth, content-type)
- `interval`: Polling interval in seconds (min: 60, max: 86400)
- `changeDetection`: Strategy to detect changes (see below)
- `itemPath`: JSONPath to extract items from response (for list endpoints)
- `idPath`: JSONPath to extract unique ID from each item

### 2. RSS/Atom Feed Polling

**Configuration**:
```json
{
  "type": "polling",
  "provider": "rss",
  "url": "https://example.com/feed.xml",
  "interval": 600,
  "changeDetection": "guid"
}
```

**Fields**:
- `url`: RSS/Atom feed URL
- `interval`: Polling interval in seconds
- `changeDetection`: Use `guid` (RSS) or `id` (Atom) for deduplication

### 3. File System Polling

**Configuration**:
```json
{
  "type": "polling",
  "provider": "filesystem",
  "path": "/data/uploads/*.json",
  "interval": 60,
  "changeDetection": "mtime",
  "deleteAfterProcessing": false
}
```

**Fields**:
- `path`: File path or glob pattern
- `interval`: Check interval in seconds
- `changeDetection`: `mtime` (modification time) or `content-hash`
- `deleteAfterProcessing`: Remove file after successful processing

## Change Detection Strategies

### 1. ETag

Compare `ETag` header from HTTP response.

**Implementation**:
```typescript
async function pollWithETag(connector: Connector): Promise<void> {
  const state = await getConnectorState(connector.id);

  const response = await fetch(connector.config.url, {
    method: connector.config.method || 'GET',
    headers: {
      ...connector.config.headers,
      'If-None-Match': state.etag || '',
    },
  });

  if (response.status === 304) {
    // Not modified
    logger.debug({ connectorId: connector.id }, 'No changes detected (ETag match)');
    return;
  }

  const etag = response.headers.get('etag');
  const data = await response.json();

  // Process new data
  await processNewData(connector, data);

  // Update state
  await updateConnectorState(connector.id, { etag, lastPolledAt: new Date() });
}
```

### 2. Last-Modified

Compare `Last-Modified` header.

**Implementation**:
```typescript
async function pollWithLastModified(connector: Connector): Promise<void> {
  const state = await getConnectorState(connector.id);

  const response = await fetch(connector.config.url, {
    method: connector.config.method || 'GET',
    headers: {
      ...connector.config.headers,
      'If-Modified-Since': state.lastModified || '',
    },
  });

  if (response.status === 304) {
    logger.debug({ connectorId: connector.id }, 'No changes detected (Last-Modified)');
    return;
  }

  const lastModified = response.headers.get('last-modified');
  const data = await response.json();

  await processNewData(connector, data);
  await updateConnectorState(connector.id, { lastModified, lastPolledAt: new Date() });
}
```

### 3. Content Hash

Hash response body and compare.

**Implementation**:
```typescript
import crypto from 'node:crypto';

async function pollWithContentHash(connector: Connector): Promise<void> {
  const state = await getConnectorState(connector.id);

  const response = await fetch(connector.config.url, {
    method: connector.config.method || 'GET',
    headers: connector.config.headers,
  });

  const body = await response.text();
  const hash = crypto.createHash('sha256').update(body).digest('hex');

  if (hash === state.contentHash) {
    logger.debug({ connectorId: connector.id }, 'No changes detected (content hash match)');
    return;
  }

  const data = JSON.parse(body);
  await processNewData(connector, data);
  await updateConnectorState(connector.id, { contentHash: hash, lastPolledAt: new Date() });
}
```

### 4. Incremental ID

Track highest ID seen, fetch items with ID > lastId.

**Implementation**:
```typescript
async function pollWithIncrementalId(connector: Connector): Promise<void> {
  const state = await getConnectorState(connector.id);

  const response = await fetch(connector.config.url, {
    method: connector.config.method || 'GET',
    headers: connector.config.headers,
  });

  const data = await response.json();
  const items = jsonPath.query(data, connector.config.itemPath || '$');

  // Filter new items
  const newItems = items.filter(item => {
    const id = jsonPath.value(item, connector.config.idPath || '$.id');
    return id > (state.lastId || 0);
  });

  if (newItems.length === 0) {
    logger.debug({ connectorId: connector.id }, 'No new items');
    return;
  }

  // Process each new item
  for (const item of newItems) {
    await processEvent(connector, item);
  }

  // Update last ID
  const maxId = Math.max(...newItems.map(item =>
    jsonPath.value(item, connector.config.idPath || '$.id')
  ));
  await updateConnectorState(connector.id, { lastId: maxId, lastPolledAt: new Date() });
}
```

### 5. RSS GUID

Track seen GUIDs for RSS feeds.

**Implementation**:
```typescript
import Parser from 'rss-parser';

async function pollRSSFeed(connector: Connector): Promise<void> {
  const parser = new Parser();
  const feed = await parser.parseURL(connector.config.url);

  const state = await getConnectorState(connector.id);
  const seenGuids = new Set(state.seenGuids || []);

  const newItems = feed.items.filter(item => !seenGuids.has(item.guid));

  if (newItems.length === 0) {
    logger.debug({ connectorId: connector.id }, 'No new RSS items');
    return;
  }

  for (const item of newItems) {
    await processEvent(connector, {
      title: item.title,
      link: item.link,
      content: item.contentSnippet || item.content,
      pubDate: item.pubDate,
    });
    seenGuids.add(item.guid);
  }

  // Keep only last 1000 GUIDs to prevent unbounded growth
  const recentGuids = Array.from(seenGuids).slice(-1000);
  await updateConnectorState(connector.id, {
    seenGuids: recentGuids,
    lastPolledAt: new Date()
  });
}
```

## Polling Scheduler

### Interval-Based Scheduling

```typescript
class PollingScheduler {
  private timers = new Map<string, NodeJS.Timeout>();

  async startPolling(connector: Connector): Promise<void> {
    if (this.timers.has(connector.id)) {
      logger.warn({ connectorId: connector.id }, 'Polling already started');
      return;
    }

    const poll = async () => {
      try {
        await this.executePoll(connector);
      } catch (error) {
        logger.error({ error, connectorId: connector.id }, 'Polling error');
      }
    };

    // Initial poll
    await poll();

    // Schedule recurring polls
    const timer = setInterval(poll, connector.config.interval * 1000);
    this.timers.set(connector.id, timer);

    logger.info({
      connectorId: connector.id,
      interval: connector.config.interval
    }, 'Polling started');
  }

  async stopPolling(connectorId: string): Promise<void> {
    const timer = this.timers.get(connectorId);
    if (timer) {
      clearInterval(timer);
      this.timers.delete(connectorId);
      logger.info({ connectorId }, 'Polling stopped');
    }
  }

  private async executePoll(connector: Connector): Promise<void> {
    switch (connector.config.changeDetection) {
      case 'etag':
        await pollWithETag(connector);
        break;
      case 'last-modified':
        await pollWithLastModified(connector);
        break;
      case 'content-hash':
        await pollWithContentHash(connector);
        break;
      case 'incremental-id':
        await pollWithIncrementalId(connector);
        break;
      case 'guid':
        await pollRSSFeed(connector);
        break;
      default:
        throw new Error(`Unknown change detection strategy: ${connector.config.changeDetection}`);
    }
  }
}
```

### Cron-Based Scheduling (Alternative)

For more complex schedules (e.g., "every weekday at 9am"):

```typescript
import { CronJob } from 'cron';

class CronPollingScheduler {
  private jobs = new Map<string, CronJob>();

  async startPolling(connector: Connector): Promise<void> {
    const job = new CronJob(
      connector.config.cronExpression,
      async () => {
        try {
          await this.executePoll(connector);
        } catch (error) {
          logger.error({ error, connectorId: connector.id }, 'Polling error');
        }
      },
      null,
      true,
      connector.config.timezone || 'UTC'
    );

    this.jobs.set(connector.id, job);
    logger.info({ connectorId: connector.id }, 'Cron polling started');
  }

  async stopPolling(connectorId: string): Promise<void> {
    const job = this.jobs.get(connectorId);
    if (job) {
      job.stop();
      this.jobs.delete(connectorId);
    }
  }
}
```

## Connector State Storage

### State Schema

```sql
CREATE TABLE connector_state (
  connector_id TEXT PRIMARY KEY,
  state TEXT NOT NULL, -- JSON: { etag, lastModified, contentHash, lastId, seenGuids, lastPolledAt }
  updated_at TEXT NOT NULL,
  FOREIGN KEY (connector_id) REFERENCES connectors(id) ON DELETE CASCADE
);
```

### State Management

```typescript
interface ConnectorState {
  etag?: string;
  lastModified?: string;
  contentHash?: string;
  lastId?: number;
  seenGuids?: string[];
  lastPolledAt?: Date;
}

async function getConnectorState(connectorId: string): Promise<ConnectorState> {
  const row = await db
    .select()
    .from(connectorState)
    .where(eq(connectorState.connectorId, connectorId))
    .get();

  return row ? JSON.parse(row.state) : {};
}

async function updateConnectorState(
  connectorId: string,
  state: Partial<ConnectorState>
): Promise<void> {
  const existing = await getConnectorState(connectorId);
  const merged = { ...existing, ...state };

  await db
    .insert(connectorState)
    .values({
      connectorId,
      state: JSON.stringify(merged),
      updatedAt: new Date().toISOString(),
    })
    .onConflictDoUpdate({
      target: connectorState.connectorId,
      set: {
        state: JSON.stringify(merged),
        updatedAt: new Date().toISOString(),
      },
    });
}
```

## Error Handling

### Transient Errors

Retry on next poll interval:
- Network errors (ECONNREFUSED, ETIMEDOUT)
- Server errors (5xx)
- Rate limiting (429)

### Permanent Errors

Disable connector after 3 consecutive failures:
- Authentication errors (401, 403)
- Not found (404)
- Invalid response format

```typescript
async function executePoll(connector: Connector): Promise<void> {
  try {
    await pollWithStrategy(connector);

    // Reset failure count on success
    await updateConnectorState(connector.id, { consecutiveFailures: 0 });
  } catch (error) {
    const state = await getConnectorState(connector.id);
    const failures = (state.consecutiveFailures || 0) + 1;

    await updateConnectorState(connector.id, { consecutiveFailures: failures });

    if (failures >= 3) {
      await connectorRepo.update(connector.id, { enabled: false });
      logger.error({ connectorId: connector.id }, 'Connector disabled after 3 consecutive failures');
    }

    throw error;
  }
}
```

## Performance Optimization

### Parallel Polling

Poll multiple connectors concurrently:

```typescript
async function pollAllConnectors(): Promise<void> {
  const connectors = await connectorRepo.listByType('polling', { enabled: true });

  await Promise.allSettled(
    connectors.map(connector => executePoll(connector))
  );
}
```

### Rate Limiting

Respect API rate limits:

```typescript
import Bottleneck from 'bottleneck';

const limiter = new Bottleneck({
  maxConcurrent: 5,
  minTime: 200, // 200ms between requests
});

async function pollWithRateLimit(connector: Connector): Promise<void> {
  return limiter.schedule(() => executePoll(connector));
}
```

### Conditional Requests

Use `If-None-Match` and `If-Modified-Since` headers to reduce bandwidth:

```typescript
const headers: Record<string, string> = {
  ...connector.config.headers,
};

if (state.etag) {
  headers['If-None-Match'] = state.etag;
}

if (state.lastModified) {
  headers['If-Modified-Since'] = state.lastModified;
}

const response = await fetch(connector.config.url, { headers });

if (response.status === 304) {
  // Not modified, no need to parse body
  return;
}
```

## Testing

### Unit Tests

```typescript
describe('Polling Change Detection', () => {
  it('detects changes with ETag', async () => {
    const connector = createTestConnector({
      config: { changeDetection: 'etag' },
    });

    // First poll
    await updateConnectorState(connector.id, { etag: 'old-etag' });

    // Mock response with new ETag
    fetchMock.mockResponseOnce(JSON.stringify({ data: 'new' }), {
      headers: { 'ETag': 'new-etag' },
    });

    await pollWithETag(connector);

    const state = await getConnectorState(connector.id);
    expect(state.etag).toBe('new-etag');
  });

  it('skips processing when ETag matches', async () => {
    const connector = createTestConnector({
      config: { changeDetection: 'etag' },
    });

    await updateConnectorState(connector.id, { etag: 'same-etag' });

    fetchMock.mockResponseOnce('', { status: 304 });

    const processEventSpy = vi.spyOn(eventProcessor, 'processEvent');
    await pollWithETag(connector);

    expect(processEventSpy).not.toHaveBeenCalled();
  });
});
```

### Integration Tests

```typescript
describe('HTTP Polling Connector', () => {
  it('polls API and processes new items', async () => {
    const connector = await createTestConnector({
      type: 'polling',
      provider: 'http',
      config: {
        url: 'https://api.example.com/items',
        interval: 60,
        changeDetection: 'incremental-id',
        itemPath: '$.items',
        idPath: '$.id',
      },
    });

    // Mock API response
    fetchMock.mockResponseOnce(JSON.stringify({
      items: [
        { id: 1, message: 'Item 1' },
        { id: 2, message: 'Item 2' },
      ],
    }));

    await pollWithIncrementalId(connector);

    const events = await eventRepo.listByConnectorId(connector.id);
    expect(events).toHaveLength(2);
    expect(events[0].payload).toMatchObject({ id: 1, message: 'Item 1' });
  });
});
```

## Configuration Examples

### REST API with Incremental ID

```json
{
  "name": "GitHub Issues",
  "type": "polling",
  "provider": "http",
  "agentId": "agent-123",
  "config": {
    "url": "https://api.github.com/repos/owner/repo/issues",
    "method": "GET",
    "headers": {
      "Authorization": "Bearer ghp_token",
      "Accept": "application/vnd.github.v3+json"
    },
    "interval": 300,
    "changeDetection": "incremental-id",
    "itemPath": "$",
    "idPath": "$.number"
  },
  "transformation": {
    "inputTemplate": "New issue #{{body.number}}: {{body.title}}\n{{body.body}}"
  }
}
```

### RSS Feed

```json
{
  "name": "Tech News Feed",
  "type": "polling",
  "provider": "rss",
  "agentId": "agent-456",
  "config": {
    "url": "https://news.ycombinator.com/rss",
    "interval": 600,
    "changeDetection": "guid"
  },
  "transformation": {
    "inputTemplate": "{{body.title}}\n{{body.link}}\n\n{{body.content}}"
  }
}
```

### File System Watcher

```json
{
  "name": "Upload Processor",
  "type": "polling",
  "provider": "filesystem",
  "agentId": "agent-789",
  "config": {
    "path": "/data/uploads/*.json",
    "interval": 60,
    "changeDetection": "mtime",
    "deleteAfterProcessing": true
  },
  "transformation": {
    "jsonPath": "$"
  }
}
```

### API with ETag

```json
{
  "name": "Weather API",
  "type": "polling",
  "provider": "http",
  "agentId": "agent-101",
  "config": {
    "url": "https://api.weather.com/current",
    "method": "GET",
    "headers": {
      "API-Key": "weather-api-key"
    },
    "interval": 1800,
    "changeDetection": "etag"
  },
  "transformation": {
    "inputTemplate": "Current weather: {{body.temperature}}°C, {{body.condition}}"
  }
}
```

## Best Practices

1. **Choose appropriate intervals**: Don't poll too frequently (respect API rate limits)
2. **Use conditional requests**: Leverage ETag/Last-Modified to reduce bandwidth
3. **Handle rate limiting**: Implement exponential backoff for 429 responses
4. **Monitor polling health**: Track consecutive failures, disable after threshold
5. **Clean up state**: Limit stored GUIDs/IDs to prevent unbounded growth
6. **Use webhooks when available**: Polling is less efficient than push notifications
7. **Batch processing**: For high-volume feeds, process multiple items per poll
8. **Timezone awareness**: Use UTC for timestamps, convert for display only
