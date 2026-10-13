import Link from "next/link";
import { cn } from "@/lib/utils";

/** The pill view switch, for views that are separate pages. Same look as the Tabs view switch. */
export function LinkSwitch({
  label,
  items,
  className,
}: {
  label: string;
  items: { href: string; label: string; active: boolean }[];
  className?: string;
}) {
  return (
    <nav aria-label={label} className={cn("inline-flex w-fit flex-wrap items-center gap-1 rounded-full bg-muted p-1", className)}>
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={item.active ? "page" : undefined}
          className={cn(
            "rounded-full px-4 py-1.5 text-sm font-semibold whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
            item.active ? "bg-foreground font-bold text-primary" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
