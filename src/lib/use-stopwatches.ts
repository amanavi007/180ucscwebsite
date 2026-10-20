"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Clocks, TimerOp, TimerSync } from "@/lib/interview-timers";

/**
 * Several named stopwatches shared by everyone on the interview. The clocks are stored with the session and changed by
 * the server, which stamps its own time, so a running clock keeps counting while the page is closed and two laptops
 * with different times still agree. Changes show at once here, then are replaced by what the server says.
 */
export function useStopwatches(initial: Clocks, send: (op: TimerOp) => Promise<TimerSync | null>) {
  const [clocks, setClocks] = useState<Clocks>(initial);
  const [, setTick] = useState(0);
  // Server time minus this computer's time, so a running clock reads the same everywhere.
  const offset = useRef(0);
  // Changes sent but not yet answered; a poll arriving meanwhile is older than what the person just did.
  const pending = useRef(0);
  const latest = useRef(0);

  const now = useCallback(() => Date.now() + offset.current, []);

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
      return (c.elapsed + (c.startedAt !== null ? Math.max(0, now() - c.startedAt) : 0)) / 1000;
    },
    [clocks, now],
  );

  const running = useCallback((id: string): boolean => clocks[id]?.startedAt != null, [clocks]);
  const started = useCallback((id: string): boolean => !!clocks[id] && (clocks[id].elapsed > 0 || clocks[id].startedAt !== null), [clocks]);

  /** Takes in the clocks the server holds. Ignored while this page has a change of its own in flight. */
  const applyRemote = useCallback((timers: Clocks, serverNow: number) => {
    offset.current = serverNow - Date.now();
    if (pending.current === 0) setClocks(timers);
  }, []);

  const change = useCallback(
    (op: TimerOp) => {
      const at = now();
      setClocks((prev) => {
        const out: Clocks = { ...prev };
        const pauseClock = (id: string) => {
          const c = out[id];
          if (c && c.startedAt !== null) out[id] = { elapsed: c.elapsed + (at - c.startedAt), startedAt: null };
        };
        const startClock = (id: string) => {
          out[id] = { elapsed: out[id]?.elapsed ?? 0, startedAt: out[id]?.startedAt ?? at };
        };
        if (op.op === "switch") {
          op.ids.forEach(pauseClock);
          startClock(op.next);
        } else if (op.op === "pause") pauseClock(op.id);
        else if (op.op === "reset") out[op.id] = { elapsed: 0, startedAt: null };
        else startClock(op.id);
        return out;
      });
      const mine = ++latest.current;
      pending.current += 1;
      void send(op).then((sync) => {
        pending.current -= 1;
        if (!sync) return;
        offset.current = sync.now - Date.now();
        // Only the newest answer counts, and only once nothing else is waiting.
        if (mine === latest.current && pending.current === 0) setClocks(sync.timers);
      });
    },
    [now, send],
  );

  const start = useCallback((id: string) => change({ op: "start", id }), [change]);
  const pause = useCallback((id: string) => change({ op: "pause", id }), [change]);
  const reset = useCallback((id: string) => change({ op: "reset", id }), [change]);
  /** Pauses every running clock whose id is in `ids`, then starts `next`. */
  const switchTo = useCallback((ids: string[], next: string) => change({ op: "switch", ids, next }), [change]);

  const runningIds = Object.keys(clocks).filter((id) => clocks[id].startedAt !== null);

  return { seconds, running, started, start, pause, reset, switchTo, runningIds, applyRemote, hasPending: () => pending.current > 0 };
}

export type Stopwatches = ReturnType<typeof useStopwatches>;
