import { cn } from "@/lib/utils";

export type StatusTone = "ok" | "warn" | "bad" | "neutral";

const TONES: Record<StatusTone, string> = {
  ok: "bg-status-ok text-status-ok-foreground",
  warn: "bg-status-warn text-status-warn-foreground",
  bad: "bg-status-bad text-status-bad-foreground",
  neutral: "bg-muted text-foreground",
};

/** A status is always a word, never color alone. Colors come from theme tokens, so it reads the same in light and dark. */
export function StatusChip({ tone, className, children }: { tone: StatusTone; className?: string; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm font-medium", TONES[tone], className)}>
      {children}
    </span>
  );
}
