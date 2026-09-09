"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useLinkStatus } from "next/link";
import { LoadingCurtain } from "@/components/loading-curtain";

// `src/app/loading.tsx` (a root-level Suspense fallback) turned out to be
// unreliable in this Next.js version -- confirmed live, it got stuck
// showing forever even on a plain static page's initial load, alongside
// the fully-rendered real content. It's been removed; this is the only
// mechanism driving the curtain now: useLinkStatus (a real, latency-driven
// pending state) on the specific links that cross into a differently
// laid-out part of the site, plus a fixed-duration curtain on first mount
// for the initial load/reload case below.
//
// The curtain shows the instant a watched link goes pending -- no debounce
// before showing, since a delay there reads as the UI stuttering before
// reacting to the click. MIN_VISIBLE_MS still guards the *hide* side, so a
// navigation that resolves a few ms after pending flips true doesn't
// flicker the curtain on and immediately back off.
const MIN_VISIBLE_MS = 350;

type ReportPending = (pending: boolean) => void;

const NavLoadingContext = createContext<ReportPending | null>(null);

export function NavLoadingProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shownAt = useRef<number | null>(null);

  const report = useCallback<ReportPending>((pending) => {
    if (pending) {
      if (hideTimer.current) {
        clearTimeout(hideTimer.current);
        hideTimer.current = null;
      }
      if (shownAt.current === null) {
        shownAt.current = Date.now();
        setVisible(true);
      }
      return;
    }

    if (shownAt.current !== null) {
      const remaining = Math.max(0, MIN_VISIBLE_MS - (Date.now() - shownAt.current));
      hideTimer.current = setTimeout(() => {
        shownAt.current = null;
        hideTimer.current = null;
        setVisible(false);
      }, remaining);
    }
  }, []);

  return (
    <NavLoadingContext.Provider value={report}>
      {children}
      {visible && <LoadingCurtain />}
    </NavLoadingContext.Provider>
  );
}

/**
 * Returns a function that shows/hides the curtain directly. Call it with
 * `true` from a Link's own onClick for a guaranteed-instant show: relying
 * only on useLinkStatus's pending flag can lag a click by however long
 * this Next version's router takes to schedule the transition (especially
 * noticeable when a route needs on-demand dev compilation), which reads as
 * the curtain "losing the race" instead of appearing on click.
 */
export function useNavLoadingReport() {
  return useContext(NavLoadingContext);
}

/** Drop this inside a <Link> (as a child) to have its real pending state drive the curtain. */
export function NavPendingWatcher() {
  const { pending } = useLinkStatus();
  const report = useNavLoadingReport();

  useEffect(() => {
    report?.(pending);
  }, [pending, report]);

  return null;
}

// Long enough for the roll-in + settle + wordmark fade to actually play
// out once, rather than a hydration-timed flash that could cut it off
// a few frames in on a fast load.
const INITIAL_LOAD_MS = 2400;

/**
 * Shows the curtain from first paint through a fixed minimum duration --
 * covers a cold page load or a hard reload, which the Suspense-based
 * loading.tsx isn't catching reliably. Treated as a deliberate first-paint
 * moment rather than a strict latency indicator, since actual hydration on
 * this app is normally too fast for the animation to ever be seen
 * otherwise. Render this once, directly in the root layout.
 */
export function InitialLoadCurtain() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), INITIAL_LOAD_MS);
    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;
  return <LoadingCurtain />;
}
