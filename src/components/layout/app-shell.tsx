"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Menu, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { SidebarNav } from "./sidebar-nav";
import { NotificationBell } from "./notification-bell";
import { CommandPalette } from "./command-palette";
import { OnboardingTour, type TourStep } from "./onboarding-tour";
import { NAV_LINKS } from "./nav-links";
import { ThemeToggle } from "@/components/theme-toggle";
import { logout } from "@/actions/auth";
import { roleLabel } from "@/lib/auth/roles";
import type { UserRole } from "@/lib/supabase/database.types";
import type { NotificationFeed } from "@/lib/data/notifications";

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function AppShell({
  name,
  role,
  isExec,
  notifications,
  showOnboarding,
  children,
}: {
  name: string;
  role: UserRole;
  isExec: boolean;
  notifications: NotificationFeed;
  showOnboarding: boolean;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [tourRun, setTourRun] = useState(showOnboarding);
  const collapsedBeforeTourRef = useRef(false);

  useEffect(() => {
    if (showOnboarding) return;
    if (localStorage.getItem("sidebar-collapsed") === "1") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing from localStorage, an external store, on mount
      setCollapsed(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("sidebar-collapsed", next ? "1" : "0");
      return next;
    });
  }

  function startTour() {
    collapsedBeforeTourRef.current = collapsed;
    setCollapsed(false);
    setTourRun(true);
  }

  function finishTour() {
    setTourRun(false);
    setCollapsed(collapsedBeforeTourRef.current);
  }

  const tourSteps: TourStep[] = NAV_LINKS.filter((l) => (!l.execOnly || isExec) && l.tourDescription).map(
    (l) => ({ href: l.href, label: l.label, description: l.tourDescription! }),
  );

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="flex min-h-svh md:gap-3 md:p-3">
      <aside
        className={cn(
          "glass-sidebar hidden shrink-0 overflow-hidden rounded-3xl md:flex md:flex-col",
          collapsed ? "w-16" : "w-60",
        )}
      >
        <div className={cn("flex items-center gap-2 px-4 py-4", collapsed && "justify-center px-0")}>
          <Image src="/logo-icon.png" alt="" width={987} height={1006} className="h-6 w-auto" />
          {!collapsed && (
            <span className="font-brand text-lg font-bold tracking-tight text-primary">
              180 @ UCSC
            </span>
          )}
        </div>
        <SidebarNav
          isExec={isExec}
          collapsed={collapsed}
          onToggleCollapsed={toggleCollapsed}
          onReplayTour={startTour}
        />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="glass-overlay sticky top-0 z-10 flex h-14 shrink-0 items-center justify-between px-4 md:mb-3 md:rounded-2xl">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
          >
            <Menu className="size-5" />
          </Button>
          <span className="font-brand flex items-center gap-1.5 text-sm font-bold text-muted-foreground md:hidden">
            <Image src="/logo-icon.png" alt="" width={987} height={1006} className="h-4 w-auto" />
            180 @ UCSC
          </span>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCommandOpen(true)}
            className="ml-2 hidden w-64 justify-start gap-2 rounded-full border border-foreground/10 bg-foreground/5 text-muted-foreground hover:bg-foreground/10 md:flex"
          >
            <Search className="size-3.5" />
            Search...
            <kbd className="ml-auto rounded-full border border-foreground/10 bg-foreground/5 px-1.5 py-0.5 font-mono text-[10px]">
              ⌘K
            </kbd>
          </Button>

          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCommandOpen(true)}
              aria-label="Search"
              className="md:hidden"
            >
              <Search className="size-4.5" />
            </Button>
            <NotificationBell items={notifications.items} unreadCount={notifications.unreadCount} />
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="ghost" className="gap-2 px-2">
                    <Avatar className="size-7">
                      <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                        {initials(name)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="hidden text-sm font-medium sm:inline">
                      {name}
                    </span>
                  </Button>
                }
              />
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>
                  <div className="font-medium">{name}</div>
                  <div className="text-xs font-normal text-muted-foreground">
                    {roleLabel(role)}
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => logout()}>
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-64 p-0">
          <SheetTitle className="font-brand flex items-center gap-2 px-4 py-4 text-lg font-bold tracking-tight text-primary">
            <Image src="/logo-icon.png" alt="" width={987} height={1006} className="h-6 w-auto" />
            180 @ UCSC
          </SheetTitle>
          <SidebarNav isExec={isExec} onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} isExec={isExec} />
      <OnboardingTour steps={tourSteps} run={tourRun} onFinish={finishTour} />
    </div>
  );
}
