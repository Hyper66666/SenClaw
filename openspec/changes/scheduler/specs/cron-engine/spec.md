# Cron Engine Specification

## Overview

The Cron Engine evaluates cron expressions to determine when scheduled jobs should execute. It supports standard 5-field cron syntax, special expressions, and timezone handling.

## Cron Expression Format

### Standard 5-Field Syntax

```
┌───────────── minute (0 - 59)
│ ┌───────────── hour (0 - 23)
│ │ ┌───────────── day of month (1 - 31)
│ │ │ ┌───────────── month (1 - 12)
│ │ │ │ ┌───────────── day of week (0 - 6) (Sunday = 0)
│ │ │ │ │
* * * * *
```

### Examples

| Expression | Description |
|------------|-------------|
| `0 9 * * *` | Every day at 9:00 AM |
| `*/5 * * * *` | Every 5 minutes |
| `0 0 * * 0` | Every Sunday at midnight |
| `0 9 * * 1-5` | Weekdays at 9:00 AM |
| `0 0 1 * *` | First day of every month at midnight |
| `0 */2 * * *` | Every 2 hours |

### Special Expressions

| Expression | Equivalent | Description |
|------------|------------|-------------|
| `@yearly` | `0 0 1 1 *` | Once a year at midnight on Jan 1 |
| `@annually` | `0 0 1 1 *` | Same as @yearly |
| `@monthly` | `0 0 1 * *` | Once a month at midnight on the 1st |
| `@weekly` | `0 0 * * 0` | Once a week at midnight on Sunday |
| `@daily` | `0 0 * * *` | Once a day at midnight |
| `@midnight` | `0 0 * * *` | Same as @daily |
| `@hourly` | `0 * * * *` | Once an hour at the beginning |

## Implementation

### Using cron-parser

```typescript
import { parseExpression } from 'cron-parser';

export function getNextRunTime(
  cronExpression: string,
  timezone: string = 'UTC',
  currentDate: Date = new Date()
): Date {
  try {
    const options = {
      currentDate,
      tz: timezone,
    };

    const interval = parseExpression(cronExpression, options);
    return interval.next().toDate();
  } catch (error) {
    throw new Error(`Invalid cron expression: ${cronExpression}`);
  }
}

export function getNextNRunTimes(
  cronExpression: string,
  count: number,
  timezone: string = 'UTC'
): Date[] {
  const times: Date[] = [];
  let currentDate = new Date();

  for (let i = 0; i < count; i++) {
    const nextTime = getNextRunTime(cronExpression, timezone, currentDate);
    times.push(nextTime);
    currentDate = new Date(nextTime.getTime() + 1000); // +1 second
  }

  return times;
}
```

### Validation

```typescript
export function validateCronExpression(expression: string): boolean {
  try {
    parseExpression(expression);
    return true;
  } catch (error) {
    return false;
  }
}

export function validateTimezone(timezone: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch (error) {
    return false;
  }
}
```

## Timezone Handling

### Store in UTC, Display in Local

```typescript
export interface ScheduledJob {
  id: string;
  cronExpression: string;
  timezone: string; // e.g., "America/New_York"
  nextRunAt: string; // ISO 8601 in UTC
}

// Calculate next run time in job's timezone
const nextRun = getNextRunTime(job.cronExpression, job.timezone);

// Store as UTC
job.nextRunAt = nextRun.toISOString();

// Display in job's timezone
const displayTime = new Date(job.nextRunAt).toLocaleString('en-US', {
  timeZone: job.timezone,
});
```

### Common Timezones

- `UTC` - Coordinated Universal Time
- `America/New_York` - Eastern Time
- `America/Los_Angeles` - Pacific Time
- `Europe/London` - British Time
- `Europe/Paris` - Central European Time
- `Asia/Tokyo` - Japan Standard Time
- `Australia/Sydney` - Australian Eastern Time

## Edge Cases

### Daylight Saving Time

When DST transitions occur, cron-parser handles it automatically:

```typescript
// Spring forward: 2:00 AM → 3:00 AM (skipped hour)
const expression = '0 2 * * *'; // 2:00 AM daily
const timezone = 'America/New_York';
const dstDate = new Date('2026-03-08T00:00:00Z'); // DST starts

const nextRun = getNextRunTime(expression, timezone, dstDate);
// Returns 3:00 AM (skips non-existent 2:00 AM)
```

### Last Day of Month

```typescript
// Run on last day of every month
const expression = '0 0 L * *'; // Not standard, use workaround

// Workaround: Run on 28th-31st, check if tomorrow is next month
const expression = '0 0 28-31 * *';
```

### Leap Years

```typescript
// Run on Feb 29 (leap years only)
const expression = '0 0 29 2 *';

const nextRun = getNextRunTime(expression, 'UTC', new Date('2026-01-01'));
// Returns 2028-02-29 (next leap year)
```

## Testing

```typescript
describe('Cron Engine', () => {
  it('calculates next run time', () => {
    const expression = '0 9 * * *'; // 9:00 AM daily
    const currentDate = new Date('2026-03-10T08:00:00Z');

    const nextRun = getNextRunTime(expression, 'UTC', currentDate);

    expect(nextRun).toEqual(new Date('2026-03-10T09:00:00Z'));
  });

  it('handles special expressions', () => {
    const expression = '@daily';
    const currentDate = new Date('2026-03-10T12:00:00Z');

    const nextRun = getNextRunTime(expression, 'UTC', currentDate);

    expect(nextRun).toEqual(new Date('2026-03-11T00:00:00Z'));
  });

  it('handles timezones', () => {
    const expression = '0 9 * * *'; // 9:00 AM
    const currentDate = new Date('2026-03-10T08:00:00Z');

    const nextRun = getNextRunTime(expression, 'America/New_York', currentDate);

    // 9:00 AM EST = 2:00 PM UTC (during standard time)
    expect(nextRun.getUTCHours()).toBe(14);
  });

  it('validates cron expressions', () => {
    expect(validateCronExpression('0 9 * * *')).toBe(true);
    expect(validateCronExpression('@daily')).toBe(true);
    expect(validateCronExpression('invalid')).toBe(false);
  });

  it('validates timezones', () => {
    expect(validateTimezone('UTC')).toBe(true);
    expect(validateTimezone('America/New_York')).toBe(true);
    expect(validateTimezone('Invalid/Timezone')).toBe(false);
  });

  it('gets next N run times', () => {
    const expression = '0 */6 * * *'; // Every 6 hours
    const times = getNextNRunTimes(expression, 4, 'UTC');

    expect(times).toHaveLength(4);
    expect(times[1].getTime() - times[0].getTime()).toBe(6 * 60 * 60 * 1000);
  });
});
```

## Best Practices

1. **Always specify timezone** explicitly (don't rely on system timezone)
2. **Store times in UTC** in database
3. **Validate expressions** on job creation
4. **Test DST transitions** for jobs in timezones with DST
5. **Use special expressions** for readability (@daily vs 0 0 * * *)
6. **Document timezone** in job name or description
7. **Avoid minute 0 and 30** for high-volume systems (spread load)
8. **Test leap year behavior** for Feb 29 jobs
