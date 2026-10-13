"use client";

import { cn } from "@/lib/utils";

/** A filter that narrows the list you are looking at. Selected ones are green. Never navigates. */
export function FilterChip({
  selected,
  onClick,
  count,
  children,
  className,
}: {
  selected: boolean;
  onClick: () => void;
  count?: number;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 text-[0.8125rem] font-semibold whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected
          ? "bg-status-ok text-status-ok-foreground"
          : "bg-muted text-muted-foreground hover:text-foreground",
        className,
      )}
    >
      {children}
      {count !== undefined && <span className="tabular-nums opacity-80">{count}</span>}
    </button>
  );
}
