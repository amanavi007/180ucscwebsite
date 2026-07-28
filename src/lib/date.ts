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
