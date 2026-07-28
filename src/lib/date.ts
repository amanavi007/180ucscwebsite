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
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function getOrgTodayDateString(): string {
  return formatOrgDate(new Date());
}
