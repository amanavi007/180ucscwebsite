"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Menu, Pin, Search } from "lucide-react";
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
import { NavPendingWatcher } from "@/components/nav-loading";
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

function SidebarBody({
  collapsed,
  isExec,
  onToggleCollapsed,
  onReplayTour,
}: {
  collapsed: boolean;
  isExec: boolean;
  onToggleCollapsed?: () => void;
  onReplayTour: () => void;
}) {
  return (
    <>
      <div className={cn("flex items-center gap-2 px-4 py-4", collapsed && "justify-center px-0")}>
        <Link
          href="/"
          prefetch={false}
          aria-label="180 Degrees Consulting — view public site"
          className="flex items-center gap-2 transition-opacity hover:opacity-75"
        >
          {collapsed ? (
            <Image src="/logo-icon.png" alt="" width={987} height={1006} className="h-6 w-auto" />
          ) : (
            <>
              <Image
                src="/logo-banner-dark.svg"
                alt="180 Degrees Consulting UC Santa Cruz"
                width={1610}
                height={538}
                className="h-16 w-auto dark:hidden"
              />
              <Image
                src="/logo-banner-light.svg"
                alt="180 Degrees Consulting UC Santa Cruz"
                width={1610}
                height={538}
                className="hidden h-16 w-auto dark:block"
              />
            </>
          )}
          <NavPendingWatcher />
        </Link>
      </div>
      <SidebarNav
        isExec={isExec}
        collapsed={collapsed}
        onToggleCollapsed={onToggleCollapsed}
        onReplayTour={onReplayTour}
      />
    </>
  );
}

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
  showOnboarding,
  children,
}: {
  name: string;
  role: UserRole;
  isExec: boolean;
  showOnboarding: boolean;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  // Minimized by default -- keeps the page feeling lighter at rest. Hovering
  // the minimized strip pops a full-width preview over the content (see
  // `peek` below); explicitly expanding via the collapse toggle pins it open
  // and is remembered as "0" in localStorage, overriding this default.
  const [collapsed, setCollapsed] = useState(true);
  const [peek, setPeek] = useState(false);
  const [tourRun, setTourRun] = useState(showOnboarding);
  const collapsedBeforeTourRef = useRef(true);

  useEffect(() => {
    if (showOnboarding) return;
    if (localStorage.getItem("sidebar-collapsed") === "0") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing from localStorage, an external store, on mount
      setCollapsed(false);
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

  // The hover preview's own explicit action -- distinct from `toggleCollapsed`
  // because the preview always LOOKS expanded, so a plain collapse/expand
  // chevron there would show "collapse" while actually pinning it open.
  function pinExpanded() {
    setCollapsed(false);
    localStorage.setItem("sidebar-collapsed", "0");
    setPeek(false);
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
    <div className="flex h-svh md:gap-3 md:p-3">
      <aside
        onMouseEnter={() => collapsed && setPeek(true)}
        onMouseLeave={() => setPeek(false)}
        className={cn("relative hidden min-h-0 shrink-0 md:block", collapsed ? "w-16" : "w-60")}
      >
        {/* Resting strip -- always occupies the real layout width (16 or 60),
            so nothing else on the page ever shifts. */}
        <div className="glass-sidebar absolute inset-0 flex min-h-0 flex-col overflow-hidden rounded-3xl">
          <SidebarBody
            collapsed={collapsed}
            isExec={isExec}
            onToggleCollapsed={toggleCollapsed}
            onReplayTour={startTour}
          />
        </div>

        {/* Hover preview -- floats over the page content at full width
            without reflowing it; only exists while minimized and hovered. */}
        {collapsed && peek && (
          <div className="glass-sidebar animate-in fade-in-0 zoom-in-95 absolute top-0 left-0 z-30 flex h-full w-60 origin-top-left flex-col overflow-hidden rounded-3xl shadow-2xl duration-150">
            <button
              type="button"
              onClick={pinExpanded}
              title="Keep sidebar expanded"
              aria-label="Keep sidebar expanded"
              className="absolute top-4 right-3 flex size-6 items-center justify-center rounded-md text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
            >
              <Pin className="size-3.5" />
            </button>
            <SidebarBody collapsed={false} isExec={isExec} onReplayTour={startTour} />
          </div>
        )}
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="glass-overlay z-10 flex h-14 shrink-0 items-center justify-between px-4 md:mb-3 md:rounded-2xl">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
          >
            <Menu className="size-5" />
          </Button>
          <Link
            href="/"
            prefetch={false}
            aria-label="180 Degrees Consulting — view public site"
            className="font-brand flex items-center gap-1.5 text-sm font-bold text-muted-foreground md:hidden"
          >
            <Image src="/logo-icon.png" alt="" width={987} height={1006} className="h-4 w-auto" />
            180 @ UCSC
            <NavPendingWatcher />
          </Link>

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
            <NotificationBell />
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

        <main className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
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
