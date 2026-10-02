"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type Stat = { value: string; lines: [string, string] };

function parseStat(value: string) {
  const numeric = Number(value.replace(/[^0-9]/g, ""));
  const suffix = value.replace(/[0-9,]/g, "");
  return { numeric, suffix };
}

function AnimatedNumber({
  target,
  suffix,
  active,
}: {
  target: number;
  suffix: string;
  active: boolean;
}) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!active) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const frame = requestAnimationFrame(() => setDisplay(target));
      return () => cancelAnimationFrame(frame);
    }

    const duration = 1400;
    const start = performance.now();
    let frame: number;

    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(eased * target));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active, target]);

  return (
    <>
      {display.toLocaleString("en-US")}
      {suffix}
    </>
  );
}

export function StatsBand({ stats }: { stats: Stat[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setActive(true);
          observer.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="overflow-hidden rounded-[1.75rem] border border-foreground/15 bg-background">
      <div className="grid grid-cols-2 sm:grid-cols-4">
        {stats.map((stat, i) => {
          const { numeric, suffix } = parseStat(stat.value);
          return (
            <div
              key={stat.value}
              className={cn(
                "border-foreground/15 px-6 py-8 sm:py-10",
                i % 2 === 0 && "border-r",
                i < 2 && "border-b sm:border-b-0",
                "sm:border-r sm:last:border-r-0",
              )}
            >
              <p className="font-brand text-5xl font-bold tabular-nums text-primary sm:text-6xl">
                <AnimatedNumber target={numeric} suffix={suffix} active={active} />
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {stat.lines[0]} {stat.lines[1]}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
