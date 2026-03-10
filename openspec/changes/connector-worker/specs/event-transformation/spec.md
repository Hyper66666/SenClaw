# Event Transformation Specification

## Overview

Event transformation converts raw event payloads from external sources into task inputs that agents can understand. It supports JSONPath extraction, template rendering, filtering, and data mapping.

## Transformation Pipeline

```
Raw Event Payload
       ↓
   Filtering (optional)
       ↓
   JSONPath Extraction
       ↓
   Template Rendering
       ↓
   Static Prefix/Suffix
       ↓
   Task Input (string)
```

## JSONPath Extraction

Extract specific fields from nested JSON structures.

### Syntax

Uses [JSONPath](https://goessner.net/articles/JsonPath/) syntax:

| Expression | Description | Example |
|------------|-------------|---------|
| `$` | Root object | `$` |
| `.field` | Child field | `$.user.name` |
| `['field']` | Bracket notation | `$['user']['name']` |
| `[n]` | Array index | `$.items[0]` |
| `[*]` | All array elements | `$.items[*].id` |
| `..field` | Recursive descent | `$..email` |
| `[?(@.field)]` | Filter expression | `$.items[?(@.active)]` |

### Configuration

```json
{
  "jsonPath": "$.data.message",
  "fallback": "No message provided"
}
```

### Examples

**Example 1: Simple Field Extraction**

```json
// Input payload
{
  "user": {
    "name": "Alice",
    "email": "alice@example.com"
  },
  "message": "Hello world"
}

// Transformation
{
  "jsonPath": "$.message"
}

// Output
"Hello world"
```

**Example 2: Nested Field**

```json
// Input payload
{
  "data": {
    "user": {
      "profile": {
        "displayName": "Alice Smith"
      }
    }
  }
}

// Transformation
{
  "jsonPath": "$.data.user.profile.displayName"
}

// Output
"Alice Smith"
```

**Example 3: Array Element**

```json
// Input payload
{
  "items": [
    { "id": 1, "title": "First" },
    { "id": 2, "title": "Second" }
  ]
}

// Transformation
{
  "jsonPath": "$.items[0].title"
}

// Output
"First"
```

**Example 4: Fallback Value**

```json
// Input payload
{
  "user": "Alice"
}

// Transformation
{
  "jsonPath": "$.message",
  "fallback": "No message"
}

// Output (field missing)
"No message"
```

### Implementation

```typescript
import { JSONPath } from 'jsonpath-plus';

function extractWithJSONPath(
  payload: unknown,
  path: string,
  fallback?: string
): string {
  try {
    const result = JSONPath({ path, json: payload });

    if (result.length === 0) {
      return fallback || '';
    }

    // If result is array with single element, unwrap it
    const value = result.length === 1 ? result[0] : result;

    // Convert to string
    if (typeof value === 'string') {
      return value;
    }

    return JSON.stringify(value);
  } catch (error) {
    logger.warn({ error, path }, 'JSONPath extraction failed');
    return fallback || '';
  }
}
```

## Template Rendering

Use Handlebars-style templates to compose task inputs from multiple fields.

### Syntax

| Expression | Description | Example |
|------------|-------------|---------|
| `{{field}}` | Variable interpolation | `{{user.name}}` |
| `{{body.field}}` | Access payload | `{{body.message}}` |
| `{{#if field}}...{{/if}}` | Conditional | `{{#if body.urgent}}URGENT{{/if}}` |
| `{{#each items}}...{{/each}}` | Loop | `{{#each body.items}}{{this.name}}{{/each}}` |

### Configuration

```json
{
  "inputTemplate": "New issue by {{body.user.login}}: {{body.issue.title}}\n\n{{body.issue.body}}"
}
```

### Examples

**Example 1: Simple Interpolation**

```json
// Input payload
{
  "user": { "login": "alice" },
  "issue": {
    "title": "Bug in login",
    "body": "Steps to reproduce..."
  }
}

// Transformation
{
  "inputTemplate": "New issue by {{body.user.login}}: {{body.issue.title}}"
}

// Output
"New issue by alice: Bug in login"
```

**Example 2: Multi-Line Template**

```json
// Transformation
{
  "inputTemplate": "Issue: {{body.issue.title}}\nAuthor: {{body.user.login}}\n\n{{body.issue.body}}"
}

// Output
"Issue: Bug in login
Author: alice

Steps to reproduce..."
```

**Example 3: Conditional Rendering**

```json
// Input payload
{
  "priority": "high",
  "message": "Server down"
}

// Transformation
{
  "inputTemplate": "{{#if body.priority}}[{{body.priority}}] {{/if}}{{body.message}}"
}

// Output
"[high] Server down"
```

**Example 4: Array Iteration**

```json
// Input payload
{
  "items": [
    { "name": "Item 1", "price": 10 },
    { "name": "Item 2", "price": 20 }
  ]
}

// Transformation
{
  "inputTemplate": "Order items:\n{{#each body.items}}- {{this.name}}: ${{this.price}}\n{{/each}}"
}

// Output
"Order items:
- Item 1: $10
- Item 2: $20
"
```

### Implementation

```typescript
import Handlebars from 'handlebars';

function renderTemplate(payload: unknown, template: string): string {
  try {
    const compiled = Handlebars.compile(template);
    return compiled({ body: payload });
  } catch (error) {
    logger.error({ error, template }, 'Template rendering failed');
    throw new Error(`Template rendering failed: ${error.message}`);
  }
}
```

### Custom Helpers

Register custom Handlebars helpers:

```typescript
Handlebars.registerHelper('uppercase', (str: string) => str.toUpperCase());
Handlebars.registerHelper('truncate', (str: string, len: number) =>
  str.length > len ? str.substring(0, len) + '...' : str
);
Handlebars.registerHelper('formatDate', (date: string) =>
  new Date(date).toLocaleDateString()
);

// Usage in template
{
  "inputTemplate": "{{uppercase body.status}}: {{truncate body.message 50}}"
}
```

## Filtering

Apply filters to decide whether to process an event.

### Filter Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `equals` | Exact match | `{ "field": "$.action", "operator": "equals", "value": "opened" }` |
| `not_equals` | Not equal | `{ "field": "$.status", "operator": "not_equals", "value": "closed" }` |
| `contains` | String contains | `{ "field": "$.message", "operator": "contains", "value": "error" }` |
| `not_contains` | String doesn't contain | `{ "field": "$.message", "operator": "not_contains", "value": "test" }` |
| `starts_with` | String starts with | `{ "field": "$.type", "operator": "starts_with", "value": "payment" }` |
| `ends_with` | String ends with | `{ "field": "$.email", "operator": "ends_with", "value": "@example.com" }` |
| `greater_than` | Numeric > | `{ "field": "$.amount", "operator": "greater_than", "value": 100 }` |
| `less_than` | Numeric < | `{ "field": "$.amount", "operator": "less_than", "value": 1000 }` |
| `regex` | Regex match | `{ "field": "$.email", "operator": "regex", "value": "^[a-z]+@" }` |
| `in` | Value in array | `{ "field": "$.status", "operator": "in", "value": ["open", "pending"] }` |
| `exists` | Field exists | `{ "field": "$.optional", "operator": "exists" }` |

### Configuration

```json
{
  "filters": [
    { "field": "$.action", "operator": "equals", "value": "opened" },
    { "field": "$.issue.state", "operator": "not_equals", "value": "closed" }
  ]
}
```

**Logic**: All filters must pass (AND logic). For OR logic, create multiple connectors.

### Examples

**Example 1: Single Filter**

```json
// Only process "opened" events
{
  "filters": [
    { "field": "$.action", "operator": "equals", "value": "opened" }
  ]
}

// Passes
{ "action": "opened", "issue": {...} }

// Filtered out
{ "action": "closed", "issue": {...} }
```

**Example 2: Multiple Filters (AND)**

```json
// Only process high-priority open issues
{
  "filters": [
    { "field": "$.priority", "operator": "equals", "value": "high" },
    { "field": "$.status", "operator": "equals", "value": "open" }
  ]
}

// Passes
{ "priority": "high", "status": "open" }

// Filtered out
{ "priority": "low", "status": "open" }
{ "priority": "high", "status": "closed" }
```

**Example 3: String Contains**

```json
// Only process error messages
{
  "filters": [
    { "field": "$.message", "operator": "contains", "value": "error" }
  ]
}

// Passes
{ "message": "Database error occurred" }

// Filtered out
{ "message": "Operation successful" }
```

**Example 4: Numeric Comparison**

```json
// Only process large payments
{
  "filters": [
    { "field": "$.amount", "operator": "greater_than", "value": 1000 }
  ]
}

// Passes
{ "amount": 1500 }

// Filtered out
{ "amount": 500 }
```

**Example 5: Regex Match**

```json
// Only process emails from specific domain
{
  "filters": [
    { "field": "$.email", "operator": "regex", "value": "@example\\.com$" }
  ]
}

// Passes
{ "email": "alice@example.com" }

// Filtered out
{ "email": "bob@other.com" }
```

### Implementation

```typescript
import { JSONPath } from 'jsonpath-plus';

interface Filter {
  field: string; // JSONPath
  operator: string;
  value?: unknown;
}

function passesFilters(payload: unknown, filters: Filter[]): boolean {
  if (!filters || filters.length === 0) {
    return true; // No filters = pass all
  }

  return filters.every(filter => evaluateFilter(payload, filter));
}

function evaluateFilter(payload: unknown, filter: Filter): boolean {
  const fieldValue = JSONPath({ path: filter.field, json: payload })[0];

  switch (filter.operator) {
    case 'equals':
      return fieldValue === filter.value;

    case 'not_equals':
      return fieldValue !== filter.value;

    case 'contains':
      return String(fieldValue).includes(String(filter.value));

    case 'not_contains':
      return !String(fieldValue).includes(String(filter.value));

    case 'starts_with':
      return String(fieldValue).startsWith(String(filter.value));

    case 'ends_with':
      return String(fieldValue).endsWith(String(filter.value));

    case 'greater_than':
      return Number(fieldValue) > Number(filter.value);

    case 'less_than':
      return Number(fieldValue) < Number(filter.value);

    case 'regex':
      return new RegExp(String(filter.value)).test(String(fieldValue));

    case 'in':
      return Array.isArray(filter.value) && filter.value.includes(fieldValue);

    case 'exists':
      return fieldValue !== undefined;

    default:
      logger.warn({ operator: filter.operator }, 'Unknown filter operator');
      return false;
  }
}
```

## Static Prefix/Suffix

Add static text before or after the transformed input.

### Configuration

```json
{
  "staticPrefix": "[ALERT] ",
  "jsonPath": "$.message",
  "staticSuffix": " - Please investigate immediately."
}
```

### Example

```json
// Input payload
{
  "message": "Server CPU usage at 95%"
}

// Transformation
{
  "staticPrefix": "[ALERT] ",
  "jsonPath": "$.message",
  "staticSuffix": " - Please investigate."
}

// Output
"[ALERT] Server CPU usage at 95% - Please investigate."
```

## Complete Transformation Examples

### GitHub Issue Webhook

```json
{
  "filters": [
    { "field": "$.action", "operator": "equals", "value": "opened" },
    { "field": "$.issue.labels[*].name", "operator": "contains", "value": "bug" }
  ],
  "inputTemplate": "New bug report #{{body.issue.number}} by {{body.issue.user.login}}:\n\n**{{body.issue.title}}**\n\n{{body.issue.body}}\n\nLabels: {{#each body.issue.labels}}{{this.name}} {{/each}}"
}
```

### Slack Message

```json
{
  "filters": [
    { "field": "$.event.type", "operator": "equals", "value": "app_mention" }
  ],
  "staticPrefix": "Slack mention: ",
  "jsonPath": "$.event.text"
}
```

### Payment Webhook

```json
{
  "filters": [
    { "field": "$.type", "operator": "equals", "value": "payment_intent.succeeded" },
    { "field": "$.data.object.amount", "operator": "greater_than", "value": 10000 }
  ],
  "inputTemplate": "Large payment received:\nAmount: ${{body.data.object.amount}}\nCustomer: {{body.data.object.customer}}\nCurrency: {{body.data.object.currency}}"
}
```

### RSS Feed

```json
{
  "filters": [
    { "field": "$.title", "operator": "contains", "value": "AI" }
  ],
  "inputTemplate": "New article: {{body.title}}\n\n{{body.contentSnippet}}\n\nRead more: {{body.link}}"
}
```

### API Polling with Array

```json
{
  "filters": [
    { "field": "$.status", "operator": "equals", "value": "active" }
  ],
  "inputTemplate": "Active users:\n{{#each body.users}}- {{this.name}} ({{this.email}})\n{{/each}}"
}
```

## Transformation Validation

### Schema Validation

Validate transformation config on connector creation:

```typescript
import { z } from 'zod';

const FilterSchema = z.object({
  field: z.string().startsWith('$'),
  operator: z.enum([
    'equals', 'not_equals', 'contains', 'not_contains',
    'starts_with', 'ends_with', 'greater_than', 'less_than',
    'regex', 'in', 'exists'
  ]),
  value: z.unknown().optional(),
});

const TransformationSchema = z.object({
  jsonPath: z.string().startsWith('$').optional(),
  inputTemplate: z.string().optional(),
  staticPrefix: z.string().optional(),
  staticSuffix: z.string().optional(),
  fallback: z.string().optional(),
  filters: z.array(FilterSchema).optional(),
}).refine(
  data => data.jsonPath || data.inputTemplate,
  { message: 'Either jsonPath or inputTemplate must be provided' }
);
```

### Test Transformation

Provide API endpoint to test transformations:

```
POST /api/v1/connectors/test-transformation
Content-Type: application/json

{
  "payload": { "action": "opened", "issue": { "title": "Test" } },
  "transformation": {
    "filters": [
      { "field": "$.action", "operator": "equals", "value": "opened" }
    ],
    "inputTemplate": "Issue: {{body.issue.title}}"
  }
}

Response: 200 OK
{
  "passed": true,
  "output": "Issue: Test"
}
```

## Error Handling

### Transformation Errors

```typescript
try {
  const taskInput = transformPayload(payload, transformation);
} catch (error) {
  await eventRepo.update(eventId, {
    status: 'failed',
    error: `Transformation error: ${error.message}`,
  });
  return;
}
```

### Common Errors

- **JSONPath not found**: Use fallback value or fail
- **Template syntax error**: Fail with descriptive error
- **Filter evaluation error**: Log warning, treat as not passing
- **Type mismatch**: Coerce to string or fail

## Performance Optimization

### Template Caching

Cache compiled Handlebars templates:

```typescript
const templateCache = new Map<string, HandlebarsTemplateDelegate>();

function renderTemplateWithCache(payload: unknown, template: string): string {
  let compiled = templateCache.get(template);

  if (!compiled) {
    compiled = Handlebars.compile(template);
    templateCache.set(template, compiled);
  }

  return compiled({ body: payload });
}
```

### Filter Short-Circuiting

Stop evaluating filters on first failure:

```typescript
function passesFilters(payload: unknown, filters: Filter[]): boolean {
  for (const filter of filters) {
    if (!evaluateFilter(payload, filter)) {
      return false; // Short-circuit
    }
  }
  return true;
}
```

## Testing

### Unit Tests

```typescript
describe('Event Transformation', () => {
  it('extracts field with JSONPath', () => {
    const payload = { user: { name: 'Alice' } };
    const result = extractWithJSONPath(payload, '$.user.name');
    expect(result).toBe('Alice');
  });

  it('renders template with Handlebars', () => {
    const payload = { title: 'Test', author: 'Alice' };
    const template = '{{body.title}} by {{body.author}}';
    const result = renderTemplate(payload, template);
    expect(result).toBe('Test by Alice');
  });

  it('filters events correctly', () => {
    const payload = { action: 'opened', status: 'active' };
    const filters = [
      { field: '$.action', operator: 'equals', value: 'opened' },
    ];
    expect(passesFilters(payload, filters)).toBe(true);
  });

  it('rejects filtered events', () => {
    const payload = { action: 'closed' };
    const filters = [
      { field: '$.action', operator: 'equals', value: 'opened' },
    ];
    expect(passesFilters(payload, filters)).toBe(false);
  });
});
```

## Best Practices

1. **Use JSONPath for simple extraction**, templates for complex composition
2. **Test transformations** before deploying connectors
3. **Provide fallback values** for optional fields
4. **Keep templates readable** with proper formatting
5. **Use filters liberally** to reduce unnecessary processing
6. **Cache compiled templates** for performance
7. **Validate transformation config** on connector creation
8. **Log transformation errors** with full context for debugging
9. **Sanitize output** if task input will be displayed to users
10. **Document expected payload structure** for each connector type
