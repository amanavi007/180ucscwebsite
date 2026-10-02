"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { NavPendingWatcher } from "@/components/nav-loading";
import { logout } from "@/actions/auth";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/about", label: "About Us" },
  { href: "/services", label: "Our Services" },
  { href: "/team", label: "Our Team" },
  { href: "/apply", label: "Join Us" },
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

export function MarketingNav({ user }: { user: { name: string } | null }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="pointer-events-none sticky top-0 z-40 w-full px-3 pt-3 sm:px-4">
      <div
        className={cn(
          "pointer-events-auto mx-auto flex w-full items-center gap-4 rounded-full border border-primary/15 bg-white/85 pr-2 pl-5 backdrop-blur-md transition-all duration-300 ease-in-out",
          scrolled
            ? "h-12 max-w-4xl shadow-lg shadow-black/10"
            : "h-16 max-w-5xl shadow-md shadow-black/5",
        )}
      >
        <Link href="/" className="flex shrink-0 items-center" aria-label="180 Degrees Consulting at UC Santa Cruz">
          <Image
            src="/logo-banner-tricolor.svg"
            alt="180 Degrees Consulting at UC Santa Cruz"
            width={1610}
            height={538}
            priority
            className={cn("w-auto transition-all duration-300 ease-in-out", scrolled ? "h-7" : "h-10")}
          />
        </Link>

        <nav className="hidden flex-1 items-center justify-center gap-1 lg:flex">
          {LINKS.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative rounded-full px-4 py-1.5 text-sm font-bold tracking-wide uppercase transition-colors",
                  active
                    ? "text-primary after:absolute after:bottom-0 after:left-1/2 after:h-[3px] after:w-5 after:-translate-x-1/2 after:rounded-full after:bg-warm"
                    : "text-foreground/70 hover:bg-primary/10 hover:text-foreground",
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto hidden items-center justify-end gap-2 lg:ml-0 lg:flex">
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="ghost" className="gap-2 rounded-full px-3">
                    <Avatar className="size-7">
                      <AvatarFallback className="bg-primary text-xs text-primary-foreground">
                        {initials(user.name)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm font-bold text-foreground/80">{user.name}</span>
                  </Button>
                }
              />
              <DropdownMenuContent align="end">
                <DropdownMenuItem render={<Link href="/portal" prefetch={false} />}>
                  Go to portal
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => logout()}>Sign out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Link
              href="/login"
              prefetch={false}
              className="rounded-full px-4 py-1.5 text-sm font-bold tracking-wide text-foreground/70 uppercase transition-colors hover:bg-primary/10 hover:text-foreground"
            >
              Log in
              <NavPendingWatcher />
            </Link>
          )}
          <Link
            href="/apply"
            className="rounded-full bg-warm px-5 py-2 text-sm font-bold tracking-wide text-warm-foreground uppercase transition-[filter] hover:brightness-110"
          >
            Apply
          </Link>
        </div>

        <div className="ml-auto flex items-center justify-end lg:hidden">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Open menu"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="size-5" />
          </Button>
        </div>
      </div>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="right" className="w-72">
          <SheetTitle className="px-4 py-4 text-left text-sm font-medium text-muted-foreground">
            Menu
          </SheetTitle>
          <nav className="flex flex-col gap-1 px-3">
            {LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "rounded-xl px-3 py-2.5 text-sm font-bold tracking-wide uppercase",
                  pathname === link.href
                    ? "bg-primary/15 text-primary"
                    : "text-foreground/80 hover:bg-foreground/5",
                )}
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="mt-2 flex flex-col gap-2 px-3">
            <Link
              href="/apply"
              onClick={() => setMobileOpen(false)}
              className="rounded-full bg-warm px-3 py-2.5 text-center text-sm font-bold tracking-wide text-warm-foreground uppercase"
            >
              Apply
            </Link>
            {user ? (
              <>
                <div className="flex items-center gap-2 px-3 py-1.5">
                  <Avatar className="size-7">
                    <AvatarFallback className="bg-primary text-xs text-primary-foreground">
                      {initials(user.name)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm font-bold text-foreground/80">{user.name}</span>
                </div>
                <Link
                  href="/portal"
                  prefetch={false}
                  onClick={() => setMobileOpen(false)}
                  className="rounded-xl px-3 py-2.5 text-center text-sm text-foreground/70 hover:bg-foreground/5"
                >
                  Go to portal
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setMobileOpen(false);
                    logout();
                  }}
                  className="rounded-xl px-3 py-2.5 text-center text-sm text-foreground/70 hover:bg-foreground/5"
                >
                  Sign out
                </button>
              </>
            ) : (
              <Link
                href="/login"
                prefetch={false}
                onClick={() => setMobileOpen(false)}
                className="rounded-xl px-3 py-2.5 text-center text-sm text-foreground/70 hover:bg-foreground/5"
              >
                Log in
                <NavPendingWatcher />
              </Link>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </header>
  );
}
