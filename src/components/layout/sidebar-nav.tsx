"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, HelpCircle, ShieldCheck, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ADMIN_NAV_LINKS, ADMIN_PLACES, NAV_LINKS } from "./nav-links";
import { getAdminLocation } from "@/lib/admin-nav";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

/** Pages that live under another rail item, so that item stays lit while you are on them. */
const ALSO_ACTIVE: Record<string, string[]> = {
  "/portal": ["/portal/attendance"],
  "/portal/projects": ["/portal/tasks"],
  "/portal/resources": ["/portal/quick-links"],
};

type RailItem = { id: string; href: string; label: string; icon: LucideIcon; active: boolean; outlined?: boolean };

export function SidebarNav({
  isExec,
  onNavigate,
  collapsed = false,
  onReplayTour,
}: {
  isExec: boolean;
  onNavigate?: () => void;
  collapsed?: boolean;
  onReplayTour?: () => void;
}) {
  const pathname = usePathname();
  const inAdmin = isExec && pathname.startsWith("/portal/admin");

  let items: RailItem[];
  let footer: RailItem | null = null;

  if (inAdmin) {
    const areaKey = getAdminLocation(pathname, ADMIN_NAV_LINKS)?.areaKey ?? "admin-today";
    items = ADMIN_PLACES.map((p) => ({
      id: `nav-link-${p.href}`,
      href: p.href,
      label: p.label,
      icon: p.icon,
      active: p.key === areaKey,
    }));
    footer = { id: "nav-link-back", href: "/portal", label: "Back to portal", icon: ArrowLeft, active: false, outlined: true };
  } else {
    items = NAV_LINKS.filter((l) => l.rail !== false && l.href !== "/portal/admin" && (!l.execOnly || isExec)).map((l) => ({
      id: `nav-link-${l.href}`,
      href: l.href,
      label: l.label,
      icon: l.icon,
      active:
        (l.href === "/portal" ? pathname === "/portal" : pathname.startsWith(l.href)) ||
        (ALSO_ACTIVE[l.href] ?? []).some((extra) => pathname.startsWith(extra)),
    }));
    if (isExec) {
      footer = { id: "nav-link-/portal/admin", href: "/portal/admin", label: "Admin", icon: ShieldCheck, active: false, outlined: true };
    }
  }

  function renderItem(item: RailItem) {
    const Icon = item.icon;
    const linkEl = (
      <Link
        id={item.id}
        href={item.href}
        onClick={onNavigate}
        aria-label={collapsed ? item.label : undefined}
        aria-current={item.active ? "page" : undefined}
        className={cn(
          "flex items-center gap-2.5 py-2 text-sm font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
          collapsed ? "mx-auto size-11 justify-center rounded-[14px] px-0" : "rounded-xl px-3",
          item.active
            ? "bg-sidebar-primary text-sidebar-primary-foreground"
            : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          item.outlined && !item.active && "border-[1.5px] border-sidebar-border",
        )}
      >
        <Icon className={cn("shrink-0", collapsed ? "size-[22px]" : "size-4")} />
        {!collapsed && item.label}
      </Link>
    );
    return (
      <div key={item.id}>
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger render={linkEl} />
            <TooltipContent side="right">{item.label}</TooltipContent>
          </Tooltip>
        ) : (
          linkEl
        )}
      </div>
    );
  }

  return (
    <TooltipProvider delay={200}>
      <div className="flex flex-1 flex-col">
        <nav className="flex flex-col gap-1.5 px-2" aria-label={inAdmin ? "Admin" : "Portal"}>
          {items.map(renderItem)}
        </nav>
        <div className={cn("mt-auto flex flex-col gap-2 px-2 pb-3", collapsed && "items-center")}>
          {footer && renderItem(footer)}
          {onReplayTour && (
            <div className={cn("flex", collapsed ? "justify-center" : "items-center justify-end")}>
              {collapsed ? (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <button
                        type="button"
                        onClick={onReplayTour}
                        className="flex size-7 items-center justify-center rounded-md text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
                        aria-label="Replay tour"
                      >
                        <HelpCircle className="size-4" />
                      </button>
                    }
                  />
                  <TooltipContent side="right">Replay tour</TooltipContent>
                </Tooltip>
              ) : (
                <button
                  type="button"
                  onClick={onReplayTour}
                  className="flex size-7 items-center justify-center rounded-md text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
                  aria-label="Replay tour"
                >
                  <HelpCircle className="size-4" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
