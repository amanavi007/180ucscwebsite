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
// reacting to the click. Once shown, it always holds for the full branded
// animation (roll-in + wordmark fade, see `.loading-curtain-*` in
// globals.css) before hiding, rather than cutting the animation off as soon
// as the destination happens to be ready -- keep this in sync with that
// CSS's total duration.
const CURTAIN_ANIMATION_MS = 1200;

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
      const remaining = Math.max(0, CURTAIN_ANIMATION_MS - (Date.now() - shownAt.current));
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
    // A navigation that swaps in a whole new layout (e.g. marketing -> portal)
    // unmounts this watcher in the same commit that would have flipped
    // `pending` back to false, so that transition never happens here -- without
    // this cleanup the curtain reports pending forever and only a hard reload
    // clears it.
    return () => report?.(false);
  }, [pending, report]);

  return null;
}

/**
 * Shows the curtain from first paint through the full branded animation --
 * covers a cold page load or a hard reload, which the Suspense-based
 * loading.tsx isn't catching reliably. Treated as a deliberate first-paint
 * moment rather than a strict latency indicator, since actual hydration on
 * this app is normally too fast for the animation to ever be seen
 * otherwise. Render this once, directly in the root layout.
 */
export function InitialLoadCurtain() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), CURTAIN_ANIMATION_MS);
    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;
  return <LoadingCurtain />;
}
