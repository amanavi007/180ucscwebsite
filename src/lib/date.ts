export const ORG_TIME_ZONE = "America/Los_Angeles";

/**
 * Parse a Postgres `date` column value ("YYYY-MM-DD") as a local calendar
 * date. `new Date("YYYY-MM-DD")` parses as UTC midnight, which shifts a day
 * off in any timezone behind UTC when formatted locally -- always use this
 * instead for date-only (no time component) values.
 */
export function parseLocalDate(dateString: string): Date {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/**
 * A Date as "YYYY-MM-DD" in the org's own timezone (Santa Cruz). The server
 * (Vercel functions run in UTC) has no idea where the user physically is,
 * and this app is tied to a specific campus's Tue/Thu meeting schedule, so
 * "today" should always mean today in Santa Cruz -- not UTC, and not
 * wherever a traveling exec's laptop happens to be set.
 */
export function formatOrgDate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ORG_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function getOrgTodayDateString(): string {
  return formatOrgDate(new Date());
}

/** Minutes to add to a UTC instant to get org-local wall-clock time, for the given instant (DST-aware). */
function getOrgOffsetMinutes(instant: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ORG_TIME_ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
    .formatToParts(instant)
    .reduce(
      (acc, p) => {
        acc[p.type] = p.value;
        return acc;
      },
      {} as Record<string, string>,
    );

  const asIfUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return (asIfUtc - instant.getTime()) / 60_000;
}

/**
 * A "YYYY-MM-DD" date + "HH:MM" time, both meant as org-local (Santa Cruz)
 * wall-clock, converted to the actual UTC instant -- DST-aware. Needed
 * because coffee chat slots are stored as plain date/time with no
 * timezone column (same as every other date-only column in this app), but
 * comparing a slot's start time against "now" for the minimum-lead-time
 * check requires a real instant.
 */
export function zonedDateTimeToUtc(dateStr: string, timeStr: string, timeZone: string = ORG_TIME_ZONE): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  const [hour, minute] = timeStr.split(":").map(Number);
  const guessUtcMs = Date.UTC(year, month - 1, day, hour, minute);
  const offsetMinutes = getOrgOffsetMinutes(new Date(guessUtcMs));
  return new Date(guessUtcMs - offsetMinutes * 60_000);
}
