import { cn } from "@/lib/utils";

/** The month-over-day calendar tile shared by the booking ticket and the confirmation screen. Pass no day for the empty (not chosen yet) look. */
export function DateTile({ month, day, className }: { month: string; day?: string; className?: string }) {
  return (
    <div className={cn("w-[4.25rem] shrink-0 overflow-hidden rounded-[0.875rem] border text-center", day ? "border-deep/20" : "border-border", className)}>
      <div className={cn("py-1 text-[0.6875rem] font-bold tracking-[0.12em] text-white uppercase", day ? "bg-deep" : "bg-neutral-400")}>{month}</div>
      <div className={cn("font-brand pt-1 pb-1.5 text-4xl leading-none font-extrabold", day ? "text-deep" : "text-neutral-300")}>{day ?? "–"}</div>
    </div>
  );
}
