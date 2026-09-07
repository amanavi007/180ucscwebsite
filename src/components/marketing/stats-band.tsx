"use client";

import { useEffect, useRef, useState } from "react";

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
    <div ref={ref} className="bg-primary rounded-[2.5rem] px-8 py-14 sm:px-14 sm:py-16">
      <div className="grid grid-cols-2 gap-y-10 sm:grid-cols-4 sm:divide-x sm:divide-primary-foreground/20">
        {stats.map((stat) => {
          const { numeric, suffix } = parseStat(stat.value);
          return (
            <div key={stat.value} className="text-center sm:px-6">
              <p className="font-brand text-5xl font-bold tabular-nums text-primary-foreground sm:text-6xl">
                <AnimatedNumber target={numeric} suffix={suffix} active={active} />
              </p>
              <p className="mt-2 text-sm font-medium tracking-wide text-primary-foreground uppercase">
                {stat.lines[0]}
                <br />
                {stat.lines[1]}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
