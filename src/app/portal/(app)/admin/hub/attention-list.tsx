import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AttentionItem, AttentionKind } from "@/lib/admin-attention";

const CHIP: Record<AttentionKind, { label: string; variant: "warn" | "bad" | "info" }> = {
  attendance: { label: "Check in", variant: "warn" },
  draft: { label: "Stuck", variant: "warn" },
  "team-page": { label: "Review", variant: "info" },
};

/** The queue of things that need an exec, one row each with the button that fixes it. */
export function AttentionList({ items }: { items: AttentionItem[] }) {
  return (
    <section aria-labelledby="attention-heading" className="rounded-[22px] border bg-card">
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <h2 id="attention-heading" className="text-lg">
          Needs you{items.length > 0 ? ` · ${items.length}` : ""}
        </h2>
      </div>
      {items.length === 0 ? (
        <div className="flex items-center gap-2.5 border-t px-5 py-5 text-sm text-muted-foreground">
          <CheckCircle2 className="size-5 text-link" aria-hidden />
          All clear. Nothing needs you right now.
        </div>
      ) : (
        <ul>
          {items.map((item) => {
            const chip = CHIP[item.kind];
            return (
              <li key={item.kind} className="flex items-center gap-4 border-t px-5 py-4">
                <Badge variant={chip.variant} className="shrink-0">
                  {chip.label}
                </Badge>
                <span className="min-w-0 flex-1 text-[0.9375rem] font-semibold">{item.label}</span>
                <Button size="sm" variant="outline" nativeButton={false} render={<Link href={item.href}>{item.actionLabel}</Link>} />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
