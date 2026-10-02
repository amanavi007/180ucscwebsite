import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AttentionItem } from "@/lib/admin-attention";

export function AttentionList({ items }: { items: AttentionItem[] }) {
  return (
    <section aria-labelledby="attention-heading" className="space-y-2">
      <h2
        id="attention-heading"
        className="text-xs font-semibold tracking-wide text-muted-foreground uppercase"
      >
        Needs attention{items.length > 0 ? ` · ${items.length}` : ""}
      </h2>
      {items.length === 0 ? (
        <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          <CheckCircle2 className="size-4 text-primary" />
          All clear. Nothing needs your attention right now.
        </div>
      ) : (
        <ul className="divide-y rounded-lg border border-amber-300/60 bg-amber-50/60 dark:border-amber-500/30 dark:bg-amber-950/20">
          {items.map((item) => (
            <li key={item.kind} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
              <span className="flex items-center gap-2">
                <span aria-hidden className="size-2 shrink-0 rounded-full bg-amber-500" />
                {item.label}
              </span>
              <Button
                size="sm"
                variant="outline"
                nativeButton={false}
                render={<Link href={item.href}>{item.actionLabel}</Link>}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
