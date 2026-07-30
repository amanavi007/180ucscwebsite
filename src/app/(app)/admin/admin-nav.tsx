"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ADMIN_NAV = [
  { href: "/admin", label: "Members" },
  { href: "/admin/quarters", label: "Quarters" },
  { href: "/admin/meeting-days", label: "Meeting Days" },
  { href: "/admin/rooms", label: "Rooms" },
  { href: "/admin/settings", label: "Settings" },
  { href: "/admin/team-builder", label: "Team Builder" },
  { href: "/admin/activity", label: "Activity" },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <div className="inline-flex w-fit items-center gap-[3px] rounded-lg bg-muted p-[3px]">
      {ADMIN_NAV.map((item) => {
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
  );
}
