import { cn } from "@/lib/utils";

const TINTS = [
  "bg-status-info text-status-info-foreground",
  "bg-status-warn text-status-warn-foreground",
  "bg-status-bad text-status-bad-foreground",
  "bg-status-ok text-status-ok-foreground",
];

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/** Initials in a soft tint. The tint is picked from the name so a person always looks the same. */
export function PersonAvatar({ name, className }: { name: string; className?: string }) {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-bold",
        TINTS[hash % TINTS.length],
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
