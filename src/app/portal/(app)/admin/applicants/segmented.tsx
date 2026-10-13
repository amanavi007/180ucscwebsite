"use client";

import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string> {
  value: T;
  label: React.ReactNode;
}

/** A small two-to-four way switch for views of the same data. Selected state is announced with aria-pressed. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  size = "md",
}: {
  value: T;
  onChange: (value: T) => void;
  options: SegmentedOption<T>[];
  label: string;
  size?: "sm" | "md";
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-lg bg-muted p-[3px]">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-md px-3.5 font-medium text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring aria-pressed:bg-background aria-pressed:text-foreground aria-pressed:shadow-sm",
            size === "sm" ? "h-7 text-[13px]" : "h-8 text-sm",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
