export const REVIEWS_PER_HOUR = 10;

export function isOverLimit(countInLastHour: number): boolean {
  return countInLastHour >= REVIEWS_PER_HOUR;
}

export function hourAgoIso(now: Date): string {
  return new Date(now.getTime() - 60 * 60 * 1000).toISOString();
}
