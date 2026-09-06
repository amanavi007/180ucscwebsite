"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Menu, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/about", label: "About Us" },
  { href: "/services", label: "Our Services" },
  { href: "/team", label: "Our Team" },
];

export function MarketingNav() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="glass-overlay sticky top-4 z-40 mx-4 flex h-16 items-center justify-between rounded-2xl px-4 sm:mx-6 sm:px-6 lg:mx-auto lg:max-w-6xl">
      <Link href="/" className="flex shrink-0 items-center" aria-label="180 Degrees Consulting at UC Santa Cruz">
        <Image
          src="/logo-banner-dark.svg"
          alt="180 Degrees Consulting at UC Santa Cruz"
          width={1610}
          height={538}
          priority
          className="h-9 w-auto dark:hidden"
        />
        <Image
          src="/logo-banner-light.svg"
          alt="180 Degrees Consulting at UC Santa Cruz"
          width={1610}
          height={538}
          priority
          className="hidden h-9 w-auto dark:block"
        />
      </Link>

      <nav className="hidden items-center gap-1 lg:flex">
        {LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-medium transition-colors",
              pathname === link.href
                ? "bg-primary/15 text-primary"
                : "text-foreground/70 hover:bg-foreground/5 hover:text-foreground",
            )}
          >
            {link.label}
          </Link>
        ))}
      </nav>

      <div className="hidden items-center gap-2 lg:flex">
        <ThemeToggle />
        <Button nativeButton={false} variant="outline" render={<Link href="/login" />}>
          Member Operations
        </Button>
        <Button nativeButton={false} render={<Link href="/apply" />} className="gap-1.5">
          Apply Now
          <ArrowUpRight className="size-3.5" />
        </Button>
      </div>

      <div className="flex items-center gap-1 lg:hidden">
        <ThemeToggle />
        <Button
          variant="ghost"
          size="icon"
          aria-label="Open menu"
          onClick={() => setMobileOpen(true)}
        >
          <Menu className="size-5" />
        </Button>
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
                  "rounded-xl px-3 py-2.5 text-sm font-medium",
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
            <Button
              nativeButton={false}
              variant="outline"
              render={<Link href="/login" onClick={() => setMobileOpen(false)} />}
            >
              Member Operations
            </Button>
            <Button nativeButton={false} render={<Link href="/apply" onClick={() => setMobileOpen(false)} />}>
              Apply Now
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </header>
  );
}
