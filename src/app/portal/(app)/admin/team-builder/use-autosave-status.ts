"use client";

import { useCallback, useRef, useState } from "react";

export type AutosaveStatus = "idle" | "saving" | "saved";

/**
 * Tracks a rolling "Saving.../Saved" status across any number of concurrent
 * mutations. `run` increments an in-flight counter for the duration of the
 * promise it wraps; status flips back to "saved" once the counter hits zero,
 * regardless of how many other mutations were racing it.
 */
export function useAutosaveStatus() {
  const [status, setStatus] = useState<AutosaveStatus>("idle");
  const inFlight = useRef(0);

  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T> => {
    inFlight.current += 1;
    setStatus("saving");
    try {
      return await fn();
    } finally {
      inFlight.current -= 1;
      if (inFlight.current === 0) setStatus("saved");
    }
  }, []);

  return { status, run };
}
