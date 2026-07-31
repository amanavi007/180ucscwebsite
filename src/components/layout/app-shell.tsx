"use client";

import { useEffect, useState } from "react";
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
import { SidebarNav } from "./sidebar-nav";
import { NotificationBell } from "./notification-bell";
import { CommandPalette } from "./command-palette";
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
  children,
}: {
  name: string;
  role: UserRole;
  isExec: boolean;
  notifications: NotificationFeed;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);

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
    <div className="flex min-h-svh">
      <aside className="hidden w-60 shrink-0 border-r border-sidebar-border bg-sidebar md:flex md:flex-col">
        <div className="flex items-center gap-2 px-4 py-4">
          <Image src="/logo-icon.png" alt="" width={987} height={1006} className="h-6 w-auto" />
          <span className="font-brand text-lg font-bold tracking-tight text-primary">
            180 @ UCSC
          </span>
        </div>
        <SidebarNav isExec={isExec} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b px-4">
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
            variant="outline"
            size="sm"
            onClick={() => setCommandOpen(true)}
            className="ml-2 hidden w-64 justify-start gap-2 text-muted-foreground md:flex"
          >
            <Search className="size-3.5" />
            Search...
            <kbd className="ml-auto rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">
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
    </div>
  );
}
