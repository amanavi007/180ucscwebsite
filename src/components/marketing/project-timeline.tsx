"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const STEPS = [
  { title: "Scope", body: "We align on your challenge, your goals, and what success looks like." },
  { title: "Research", body: "Market, peer, and data analysis to ground every recommendation." },
  { title: "Develop", body: "We build the slides, models, and strategy options, with your feedback along the way." },
  { title: "Hand off", body: "A final deck and an implementation plan your team can run with." },
];

// Half of the 3.5rem dot, so the line runs center-to-center between dots.
const DOT_CENTER = 28;

export function ProjectTimeline() {
  const rootRef = useRef<HTMLOListElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const [reached, setReached] = useState(1);

  useEffect(() => {
    const root = rootRef.current;
    const track = trackRef.current;
    const fill = fillRef.current;
    if (!root || !track || !fill) return;
    const items = Array.from(root.children) as HTMLElement[];
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;

    const update = () => {
      frame = 0;
      // First dot center -> last dot center.
      const total = items[items.length - 1].offsetTop;
      track.style.height = `${total}px`;
      // The line is "drawn" down to a reading line 60% of the way down the viewport.
      const top = root.getBoundingClientRect().top;
      const drawn = reduceMotion.matches
        ? total
        : Math.max(0, Math.min(total, window.innerHeight * 0.6 - (top + DOT_CENTER)));
      fill.style.height = `${drawn}px`;
      setReached(items.filter((item, i) => i === 0 || drawn >= item.offsetTop - 0.5).length);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    reduceMotion.addEventListener("change", schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      reduceMotion.removeEventListener("change", schedule);
    };
  }, []);

  return (
    <div className="relative">
      <div ref={trackRef} aria-hidden className="absolute top-7 left-[26px] w-1 rounded-full bg-primary/15" />
      <div ref={fillRef} aria-hidden className="absolute top-7 left-[26px] w-1 rounded-full bg-primary" />
      <ol ref={rootRef} className="relative">
        {STEPS.map((step, i) => {
          const on = i < reached;
          const last = i === STEPS.length - 1;
          return (
            <li key={step.title} className={cn("grid grid-cols-[3.5rem_1fr] gap-5 sm:gap-6", !last && "pb-14")}>
              <span
                className={cn(
                  "font-brand relative z-10 grid size-14 place-items-center rounded-full border-4 text-2xl font-bold transition-[background-color,border-color,color,transform] duration-500 motion-reduce:transition-none",
                  on
                    ? cn("scale-[1.07] text-primary-foreground", last ? "border-warm bg-warm" : "border-primary bg-primary")
                    : "border-primary/15 bg-background text-primary/40",
                )}
              >
                {i + 1}
              </span>
              <div className="pt-1.5">
                <h3
                  className={cn(
                    "font-brand text-2xl font-bold transition-colors duration-500 motion-reduce:transition-none",
                    on ? "text-foreground" : "text-foreground/35",
                  )}
                >
                  {step.title}
                </h3>
                <p
                  className={cn(
                    "mt-2 max-w-md text-muted-foreground text-pretty transition-opacity duration-500 motion-reduce:transition-none",
                    on ? "opacity-100" : "opacity-40",
                  )}
                >
                  {step.body}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
