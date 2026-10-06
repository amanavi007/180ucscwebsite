"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

const SERVICES = [
  {
    title: "Nonprofit Strategy",
    body: "Expansion plans, donor outreach strategy, and volunteer recruitment frameworks that scale with your mission.",
    deliverables: ["Strategy deck", "Donor playbook"],
  },
  {
    title: "Growth Strategy",
    body: "Market entry, partnership opportunities, and go-to-market plans for organizations ready to reach more people.",
    deliverables: ["Go-to-market plan", "Partner map"],
  },
  {
    title: "Market & Industry Research",
    body: "Structured research into your sector's landscape, competitors, and policy environment to ground your next move.",
    deliverables: ["Landscape report", "Competitor matrix"],
  },
  {
    title: "Operational Efficiency",
    body: "Process and resource-allocation reviews that free up time and budget for the work that matters most.",
    deliverables: ["Process audit", "Resourcing model"],
  },
  {
    title: "Branding & Marketing",
    body: "Positioning, messaging, and outreach strategy to help your organization's story reach the right audience.",
    deliverables: ["Messaging guide", "Outreach plan"],
  },
  {
    title: "Impact Measurement",
    body: "Frameworks for tracking and communicating the outcomes your organization is already creating.",
    deliverables: ["KPI framework", "Impact one-pager"],
  },
];

function ServicePanel({ index, className }: { index: number; className?: string }) {
  const service = SERVICES[index];
  return (
    <div
      className={cn(
        "relative flex flex-col justify-center overflow-hidden bg-deep px-6 py-8 text-white sm:px-10 lg:min-h-[24rem] lg:rounded-l-[2rem] lg:py-12 lg:pr-14 lg:pl-12",
        className,
      )}
    >
      <span
        aria-hidden
        className="font-brand pointer-events-none absolute -right-2 -bottom-10 text-[10rem] leading-none font-extrabold text-[#b9dc8c]/10 select-none lg:right-8 lg:-bottom-14 lg:text-[16rem]"
      >
        {String(index + 1).padStart(2, "0")}
      </span>
      {/* Keyed so the content re-mounts and replays the fade each time the selection changes. */}
      <div key={index} className="relative animate-in fade-in slide-in-from-bottom-2 duration-300">
        <h3 className="font-brand text-2xl font-bold text-[#b9dc8c] sm:text-3xl">{service.title}</h3>
        <p className="mt-3 max-w-xl text-[#e6efd9] text-pretty sm:text-lg lg:max-w-[70%]">{service.body}</p>
        <p className="mt-6 text-[0.65rem] font-bold tracking-widest text-[#8fb067] uppercase">Typical deliverables</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {service.deliverables.map((d) => (
            <span key={d} className="rounded-full border border-[#b9dc8c]/60 px-3 py-1 text-xs text-[#b9dc8c] sm:text-sm">
              {d}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ServiceSpotlight() {
  const [active, setActive] = useState(0);

  return (
    <div className="mt-8 grid gap-10 lg:grid-cols-[0.85fr_1.5fr] lg:gap-10">
      <ul className="space-y-1 lg:space-y-0">
        {SERVICES.map((service, i) => {
          const isActive = active === i;
          return (
            <li key={service.title} className="border-t border-foreground/10 first:border-t-0">
              <button
                type="button"
                aria-current={isActive}
                onClick={() => setActive(i)}
                onMouseEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                className={cn(
                  "group flex w-full items-center gap-3 rounded-xl px-3.5 py-3.5 text-left text-base font-semibold transition-all duration-300 sm:text-lg lg:py-3 lg:text-xl",
                  isActive
                    ? "bg-background text-foreground shadow-md shadow-black/10 lg:translate-x-2"
                    : "text-foreground/55 hover:bg-background/60 hover:text-foreground lg:hover:translate-x-2",
                )}
              >
                <span className={cn("font-brand w-7 shrink-0 text-base", isActive ? "text-primary" : "text-primary/40")}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="flex-1">{service.title}</span>
                <ArrowRight
                  aria-hidden
                  className={cn("size-4 shrink-0 text-primary transition-opacity", isActive ? "opacity-100" : "opacity-0")}
                />
              </button>
              {/* Mobile: the detail opens right under the selected row. */}
              {isActive && <ServicePanel index={i} className="mt-2 rounded-2xl lg:hidden" />}
            </li>
          );
        })}
      </ul>
      {/* Desktop: one panel beside the list, bleeding off the right edge. */}
      <ServicePanel index={active} className="hidden lg:flex" />
    </div>
  );
}
