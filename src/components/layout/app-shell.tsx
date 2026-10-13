"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
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
  onReplayTour,
}: {
  collapsed: boolean;
  isExec: boolean;
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
            <Image src="/logo-icon.png" alt="" width={987} height={1006} className="h-7 w-auto" />
          ) : (
            <Image
              src="/logo-banner-light.svg"
              alt="180 Degrees Consulting UC Santa Cruz"
              width={1610}
              height={538}
              className="h-16 w-auto"
            />
          )}
          <NavPendingWatcher />
        </Link>
      </div>
      <SidebarNav isExec={isExec} collapsed={collapsed} onReplayTour={onReplayTour} />
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
  // The sidebar is always minimized at rest -- there's no pinned/expanded
  // state anymore. Hovering it reveals a floating full-width preview over
  // the page content; moving away snaps it back.
  const [expanded, setExpanded] = useState(false);
  const [tourRun, setTourRun] = useState(showOnboarding);

  function startTour() {
    setExpanded(true);
    setTourRun(true);
  }

  function finishTour() {
    setTourRun(false);
    setExpanded(false);
  }

  const tourSteps: TourStep[] = NAV_LINKS.filter((l) => l.rail !== false && (!l.execOnly || isExec) && l.tourDescription).map(
    (l) => ({ href: l.href, label: l.label, description: l.tourDescription! }),
  );

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandOpen((o) => !o);
      }
    }
    function onOpenRequest() {
      setCommandOpen(true);
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("open-command-palette", onOpenRequest);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("open-command-palette", onOpenRequest);
    };
  }, []);

  return (
    <div className="flex h-svh">
      <aside
        onMouseEnter={() => setExpanded(true)}
        onMouseLeave={() => setExpanded(false)}
        className="relative z-20 hidden min-h-0 w-[72px] shrink-0 md:block"
      >
        {/* Resting strip -- always occupies the real layout width, so
            nothing else on the page ever shifts. */}
        <div className="glass-sidebar absolute inset-0 flex min-h-0 flex-col overflow-hidden">
          <SidebarBody collapsed isExec={isExec} onReplayTour={startTour} />
        </div>

        {/* Hover preview -- floats over the page content at full width
            without reflowing it. Always mounted (never conditionally
            rendered) so both the open and close transitions animate on the
            same element instead of popping in/out abruptly. */}
        <div
          inert={!expanded}
          className={cn(
            "glass-sidebar glass-sidebar-floating absolute top-0 left-0 z-30 flex h-full w-60 flex-col overflow-hidden rounded-r-3xl shadow-2xl transition-[opacity,transform] duration-200 ease-out",
            expanded
              ? "translate-x-0 opacity-100"
              : "pointer-events-none -translate-x-2 opacity-0",
          )}
        >
          <SidebarBody collapsed={false} isExec={isExec} onReplayTour={startTour} />
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="z-10 flex h-16 shrink-0 items-center justify-between border-b bg-background px-4 md:px-10">
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
            className="flex items-center md:hidden"
          >
            <Image
              src="/logo-banner-dark.svg"
              alt="180 Degrees Consulting UC Santa Cruz"
              width={1610}
              height={538}
              className="h-9 w-auto dark:hidden"
            />
            <Image
              src="/logo-banner-light.svg"
              alt="180 Degrees Consulting UC Santa Cruz"
              width={1610}
              height={538}
              className="hidden h-9 w-auto dark:block"
            />
            <NavPendingWatcher />
          </Link>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCommandOpen(true)}
            className="ml-2 hidden w-80 justify-start gap-2 border border-border bg-card font-medium text-muted-foreground hover:bg-muted md:flex"
          >
            <Search className="size-3.5" />
            Search...
            <kbd className="ml-auto rounded-md border border-border px-1.5 py-0.5 font-mono text-xs">
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
                <DropdownMenuItem render={<Link href="/portal/profile" />}>
                  My profile
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => logout()}>
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto p-4 md:px-10 md:py-8">{children}</main>
      </div>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-64 bg-sidebar p-0 text-sidebar-foreground">
          <SheetTitle className="px-4 py-4">
            <Image
              src="/logo-banner-light.svg"
              alt="180 Degrees Consulting UC Santa Cruz"
              width={1610}
              height={538}
              className="h-14 w-auto"
            />
          </SheetTitle>
          <SidebarNav isExec={isExec} onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} isExec={isExec} />
      <OnboardingTour steps={tourSteps} run={tourRun} onFinish={finishTour} />
    </div>
  );
}
