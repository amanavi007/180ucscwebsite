export interface Clock {
  /** Milliseconds counted before the current run. */
  elapsed: number;
  /** When the current run started (server epoch milliseconds), or null when paused. */
  startedAt: number | null;
}

export type Clocks = Record<string, Clock>;

export type TimerOp = { op: "start" | "pause" | "reset"; id: string } | { op: "switch"; ids: string[]; next: string };

/** What the server answers after a timer change: the clocks as stored, and the server's time when it answered. */
export interface TimerSync {
  timers: Clocks;
  now: number;
}

/** Reads the stored timers, dropping anything that isn't a clock. */
export function asClocks(value: unknown): Clocks {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const out: Clocks = {};
  for (const [id, c] of Object.entries(value)) {
    if (typeof c !== "object" || c === null) continue;
    const { elapsed, startedAt } = c as Record<string, unknown>;
    if (typeof elapsed !== "number") continue;
    out[id] = { elapsed, startedAt: typeof startedAt === "number" ? startedAt : null };
  }
  return out;
}
