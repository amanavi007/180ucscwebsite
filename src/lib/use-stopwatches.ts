"use client";

import { useCallback, useEffect, useState } from "react";

interface Clock {
  /** Milliseconds counted before the current run. */
  elapsed: number;
  /** When the current run started, or null when paused. */
  startedAt: number | null;
}

type Clocks = Record<string, Clock>;

function load(storageKey: string): Clocks {
  try {
    const raw = sessionStorage.getItem(storageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Clocks;
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Several named stopwatches that survive switching sections and reloading the page (kept per browser tab).
 * A running clock keeps counting while the page is closed, because it stores when it started.
 */
export function useStopwatches(storageKey: string) {
  // The workspace only mounts after a click, never during server rendering, so reading storage here is safe.
  const [clocks, setClocks] = useState<Clocks>(() => load(storageKey));
  const [, setTick] = useState(0);

  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(clocks));
    } catch {
      // Private windows can refuse storage; the timers still work for this visit.
    }
  }, [clocks, storageKey]);

  const anyRunning = Object.values(clocks).some((c) => c.startedAt !== null);
  useEffect(() => {
    if (!anyRunning) return;
    const id = setInterval(() => setTick((n) => n + 1), 500);
    return () => clearInterval(id);
  }, [anyRunning]);

  const seconds = useCallback(
    (id: string): number => {
      const c = clocks[id];
      if (!c) return 0;
      return (c.elapsed + (c.startedAt !== null ? Date.now() - c.startedAt : 0)) / 1000;
    },
    [clocks],
  );

  const running = useCallback((id: string): boolean => clocks[id]?.startedAt != null, [clocks]);
  const started = useCallback((id: string): boolean => !!clocks[id] && (clocks[id].elapsed > 0 || clocks[id].startedAt !== null), [clocks]);

  const start = useCallback((id: string) => {
    setClocks((prev) => ({ ...prev, [id]: { elapsed: prev[id]?.elapsed ?? 0, startedAt: prev[id]?.startedAt ?? Date.now() } }));
  }, []);

  const pause = useCallback((id: string) => {
    setClocks((prev) => {
      const c = prev[id];
      if (!c || c.startedAt === null) return prev;
      return { ...prev, [id]: { elapsed: c.elapsed + (Date.now() - c.startedAt), startedAt: null } };
    });
  }, []);

  const reset = useCallback((id: string) => {
    setClocks((prev) => ({ ...prev, [id]: { elapsed: 0, startedAt: null } }));
  }, []);

  /** Pauses every running clock whose id is in `ids`, then starts `next`. */
  const switchTo = useCallback((ids: string[], next: string) => {
    setClocks((prev) => {
      const now = Date.now();
      const out: Clocks = { ...prev };
      for (const id of ids) {
        const c = out[id];
        if (c && c.startedAt !== null) out[id] = { elapsed: c.elapsed + (now - c.startedAt), startedAt: null };
      }
      out[next] = { elapsed: out[next]?.elapsed ?? 0, startedAt: out[next]?.startedAt ?? now };
      return out;
    });
  }, []);

  const runningIds = Object.keys(clocks).filter((id) => clocks[id].startedAt !== null);

  return { seconds, running, started, start, pause, reset, switchTo, runningIds };
}

export type Stopwatches = ReturnType<typeof useStopwatches>;
