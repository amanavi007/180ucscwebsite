import { ORG_TIME_ZONE } from "@/lib/date";

/** Greeting word for an hour of the day (0-23), e.g. "Morning" for 9. */
export function greetingForHour(hour: number): string {
  if (hour >= 5 && hour < 12) return "Morning";
  if (hour >= 12 && hour < 17) return "Afternoon";
  if (hour >= 17 && hour < 22) return "Evening";
  return "Late night";
}

/** Current hour (0-23) at the org's home time zone, so the server-rendered greeting never mismatches on hydrate. */
export function currentOrgHour(now: Date = new Date()): number {
  const h = new Intl.DateTimeFormat("en-US", { timeZone: ORG_TIME_ZONE, hour: "2-digit", hourCycle: "h23" }).format(now);
  return Number.parseInt(h, 10) % 24;
}
