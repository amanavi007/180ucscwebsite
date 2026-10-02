"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

const STEPS = [
  { title: "Scope", body: "We align on your challenge, your goals, and what success looks like." },
  { title: "Research", body: "Market, peer, and data analysis to ground every recommendation." },
  { title: "Develop", body: "We build the slides, models, and strategy options, with your feedback along the way." },
  { title: "Hand off", body: "A final deck and an implementation plan your team can run with." },
];

export function ProjectSteps() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <div className="relative mt-12 grid items-start gap-x-4 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
      <div
        aria-hidden
        className="absolute inset-x-[6%] top-[22px] hidden h-0.5 bg-[repeating-linear-gradient(90deg,var(--primary)_0_8px,transparent_8px_14px)] lg:block"
      />
      {STEPS.map((step, i) => {
        const isOpen = open === i;
        return (
          <button
            key={step.title}
            type="button"
            aria-expanded={isOpen}
            onClick={() => setOpen(isOpen ? null : i)}
            className={cn(
              "group relative mt-6 rounded-2xl border bg-background px-4 pt-9 pb-4 text-left shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-primary hover:shadow-lg hover:shadow-primary/20 focus-visible:-translate-y-1 focus-visible:border-primary focus-visible:outline-none",
              isOpen ? "-translate-y-1 border-primary shadow-lg shadow-primary/20" : "border-transparent",
            )}
          >
            <span
              className={cn(
                "font-brand absolute -top-6 left-4 grid size-12 place-items-center rounded-full border-4 border-mint text-2xl font-bold text-primary-foreground transition-transform duration-300 group-hover:scale-105 group-focus-visible:scale-105",
                i === STEPS.length - 1 ? "bg-warm" : "bg-primary",
              )}
            >
              {i + 1}
            </span>
            <span className="flex items-center justify-between text-base font-semibold sm:text-lg">
              {step.title}
              <span
                aria-hidden
                className={cn(
                  "text-xl font-normal text-primary transition-transform duration-300 group-hover:rotate-45 group-focus-visible:rotate-45",
                  isOpen && "rotate-45",
                )}
              >
                +
              </span>
            </span>
            <span
              className={cn(
                "grid transition-[grid-template-rows] duration-300 ease-out group-hover:grid-rows-[1fr] group-focus-visible:grid-rows-[1fr]",
                isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
              )}
            >
              <span className="overflow-hidden">
                <span className="mt-2 block text-sm text-muted-foreground text-pretty">{step.body}</span>
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
