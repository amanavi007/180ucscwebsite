export function cacheKey(userId: string, text: string): string {
  return `${userId}::${text.trim().toLowerCase().replace(/\s+/g, " ")}`;
}

/** Tiny in-memory TTL cache (per server instance). Best-effort by design: a miss only costs tokens. */
export class AnswerCache {
  private entries = new Map<string, { value: string; at: number }>();
  constructor(private ttlMs: number, private maxEntries: number) {}

  get(key: string, now: number): string | undefined {
    const e = this.entries.get(key);
    if (!e) return undefined;
    if (now - e.at > this.ttlMs) {
      this.entries.delete(key);
      return undefined;
    }
    return e.value;
  }

  set(key: string, value: string, now: number): void {
    this.entries.delete(key);
    this.entries.set(key, { value, at: now });
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }
}
