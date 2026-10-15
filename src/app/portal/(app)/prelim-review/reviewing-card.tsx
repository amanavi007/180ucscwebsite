import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const LINE_WIDTHS = ["w-full", "w-full", "w-[70%]", "w-full", "w-[85%]", "w-full", "w-[70%]", "w-full", "w-full", "w-[85%]", "w-full"];
const TICKS = [
  { top: 30, delay: "0.3s" },
  { top: 78, delay: "0.9s" },
  { top: 126, delay: "1.5s" },
];

/** Shown while a file is being reviewed (20 to 40 seconds): a page with a scan line moving down it. */
export function ReviewingCard() {
  return (
    <div role="status" aria-live="polite" className="flex items-center gap-6 rounded-[22px] border bg-card p-5">
      <div aria-hidden="true" className="relative h-[170px] w-[132px] shrink-0 overflow-hidden rounded-[10px] border-[1.5px] border-foreground bg-card px-3.5 py-4">
        {LINE_WIDTHS.map((w, i) => (
          <i key={i} className={`mb-2.5 block h-[7px] rounded bg-muted ${w}`} />
        ))}
        {TICKS.map((t) => (
          <b
            key={t.top}
            className="review-tick absolute right-2.5 grid size-4 place-items-center rounded-full bg-foreground text-primary"
            style={{ top: t.top, animationDelay: t.delay }}
          >
            <Check className="size-2.5" strokeWidth={3} />
          </b>
        ))}
        <div className="review-scan" />
      </div>
      <div className="min-w-0">
        <Badge variant="info">Reviewing</Badge>
        <p className="mt-2.5 text-lg font-bold">Checking your file</p>
        <p className="mt-1 max-w-[34ch] text-sm text-muted-foreground">
          Looking at structure, sources and formatting. This usually takes under a minute. Keep this page open.
        </p>
      </div>
    </div>
  );
}
