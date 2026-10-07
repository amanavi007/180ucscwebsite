export function cutoffDate(now: Date, days = 90): string {
  return new Date(now.getTime() - days * 86_400_000).toISOString();
}
