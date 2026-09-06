"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/about", label: "About Us" },
  { href: "/services", label: "Our Services" },
  { href: "/team", label: "Our Team" },
  { href: "/apply", label: "Join Us" },
];

export function MarketingNav() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const folded = scrolled && !hovered;

  return (
    <header
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        "bg-mint sticky top-0 z-40 w-full border-b border-primary/15 shadow-sm transition-[height] duration-500 ease-in-out",
        folded ? "h-14" : "h-20",
      )}
    >
      <div className="mx-auto grid h-full max-w-6xl grid-cols-[auto_1fr_auto] items-center gap-6 px-4 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center" aria-label="180 Degrees Consulting at UC Santa Cruz">
          <Image
            src="/logo-banner-tricolor.svg"
            alt="180 Degrees Consulting at UC Santa Cruz"
            width={1610}
            height={538}
            priority
            className={cn("w-auto transition-all duration-500 ease-in-out", folded ? "h-8" : "h-14")}
          />
        </Link>

        <nav
          className={cn(
            "hidden items-center justify-center gap-2 transition-all duration-500 ease-in-out lg:flex",
            folded ? "pointer-events-none scale-95 opacity-0" : "scale-100 opacity-100",
          )}
        >
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "rounded-full px-5 py-2 text-sm font-bold tracking-wide uppercase transition-colors",
                pathname === link.href
                  ? "bg-primary/15 text-primary"
                  : "text-foreground/70 hover:bg-foreground/5 hover:text-foreground",
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div
          className={cn(
            "hidden items-center justify-end transition-all duration-500 ease-in-out lg:flex",
            folded ? "pointer-events-none scale-95 opacity-0" : "scale-100 opacity-100",
          )}
        >
          <Link
            href="/login"
            className="rounded-full border border-primary/25 px-5 py-2 text-sm font-bold tracking-wide text-foreground/70 uppercase transition-colors hover:bg-foreground/5 hover:text-foreground"
          >
            Log in
          </Link>
        </div>

        <div className="col-start-3 flex items-center justify-end lg:hidden">
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
              href="/login"
              onClick={() => setMobileOpen(false)}
              className="rounded-xl px-3 py-2.5 text-center text-sm text-foreground/70 hover:bg-foreground/5"
            >
              Log in
            </Link>
          </div>
        </SheetContent>
      </Sheet>
    </header>
  );
}
