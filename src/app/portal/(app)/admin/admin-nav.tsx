"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { ADMIN_NAV_LINKS, type NavLink } from "@/components/layout/nav-links";

const GROUP_LABEL: Record<string, string> = {
  "admin-people": "People",
  "admin-quarter-setup": "Quarter setup",
  "admin-recruitment": "Recruitment",
  "admin-system": "System",
};

/** Chunk consecutive same-group links -- every ADMIN_NAV_LINKS entry has a group, so this never falls back to "ungrouped". */
function groupLinks(links: NavLink[]): { key: string; items: NavLink[] }[] {
  const groups: { key: string; items: NavLink[] }[] = [];
  for (const link of links) {
    const key = link.group ?? link.href;
    const last = groups[groups.length - 1];
    if (last?.key === key) {
      last.items.push(link);
    } else {
      groups.push({ key, items: [link] });
    }
  }
  return groups;
}

export function AdminNav() {
  const pathname = usePathname();
  const groups = groupLinks(ADMIN_NAV_LINKS);

  return (
    <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
      {groups.map((group) => (
        <div key={group.key} className="flex flex-col gap-1.5">
          <span className="px-1 text-xs font-medium text-muted-foreground">
            {GROUP_LABEL[group.key] ?? ""}
          </span>
          <div className="inline-flex w-fit items-center gap-[3px] rounded-lg bg-muted p-[3px]">
            {group.items.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "rounded-md px-3 py-1 text-sm font-medium whitespace-nowrap transition-colors",
                    active
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
