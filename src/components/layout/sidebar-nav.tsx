"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronsLeft, ChevronsRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_LINKS } from "./nav-links";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const GROUP_LABEL: Record<string, string> = { work: "Work", people: "People" };

export function SidebarNav({
  isExec,
  onNavigate,
  collapsed = false,
  onToggleCollapsed,
}: {
  isExec: boolean;
  onNavigate?: () => void;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}) {
  const pathname = usePathname();
  const links = NAV_LINKS.filter((link) => !link.execOnly || isExec);

  const items = links.map((link, i) => {
    const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
    const Icon = link.icon;
    const lastGroup = links[i - 1]?.group;
    const groupChanged = link.group !== lastGroup;
    const showDivider = link.href === "/admin";
    const showGroupLabel = !collapsed && !!link.group && groupChanged;
    const showGap = collapsed && groupChanged && !showDivider && (!!link.group || !!lastGroup);

    const linkEl = (
      <Link
        href={link.href}
        onClick={onNavigate}
        aria-label={collapsed ? link.label : undefined}
        className={cn(
          "flex items-center gap-2.5 rounded-md py-2 text-sm font-medium transition-colors",
          collapsed ? "justify-center px-0" : "px-3",
          active
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        )}
      >
        <Icon className="size-4 shrink-0" />
        {!collapsed && link.label}
      </Link>
    );

    return (
      <div key={link.href}>
        {showDivider && <div className="mx-1 my-2 border-t border-sidebar-border" />}
        {showGap && <div className="h-3" />}
        {showGroupLabel && (
          <p className="px-3 pt-3 pb-1 text-[11px] font-medium tracking-wide text-sidebar-foreground/50 uppercase">
            {GROUP_LABEL[link.group!]}
          </p>
        )}
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger render={linkEl} />
            <TooltipContent>{link.label}</TooltipContent>
          </Tooltip>
        ) : (
          linkEl
        )}
      </div>
    );
  });

  return (
    <TooltipProvider delay={200}>
      <div className="flex flex-1 flex-col">
        <nav className="flex flex-col gap-0.5 px-2">{items}</nav>
        {onToggleCollapsed && (
          <div className={cn("mt-auto flex px-2 pb-2", collapsed ? "justify-center" : "justify-end")}>
            <button
              type="button"
              onClick={onToggleCollapsed}
              className="flex size-7 items-center justify-center rounded-md text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
            </button>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
