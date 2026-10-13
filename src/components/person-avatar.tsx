import Image from "next/image";
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

/**
 * A person's photo when they have an approved one, otherwise their initials in a soft tint. The tint is picked from
 * the name so a person always looks the same. The name is always shown beside the avatar, so the image itself is decorative.
 */
export function PersonAvatar({ name, src, className }: { name: string; src?: string | null; className?: string }) {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <span
      aria-hidden
      className={cn(
        "relative inline-flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-bold",
        TINTS[hash % TINTS.length],
        className,
      )}
    >
      {src ? <Image src={src} alt="" fill sizes="64px" className="object-cover" /> : initials(name)}
    </span>
  );
}
