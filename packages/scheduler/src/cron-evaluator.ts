import cronParser from "cron-parser";

export function calculateNextRun(
  cronExpression: string,
  timezone = "UTC",
): string {
  try {
    const interval = cronParser.parseExpression(cronExpression, {
      currentDate: new Date(),
      tz: timezone,
    });
    return interval.next().toISOString();
  } catch {
    throw new Error(`Invalid cron expression: ${cronExpression}`);
  }
}

export function validateCronExpression(cronExpression: string): boolean {
  try {
    cronParser.parseExpression(cronExpression);
    return true;
  } catch {
    return false;
  }
}

export function isValidTimeZone(timezone: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}
