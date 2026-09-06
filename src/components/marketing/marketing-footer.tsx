import Link from "next/link";
import Image from "next/image";

const LINKS = [
  { href: "/about", label: "About Us" },
  { href: "/services", label: "Our Services" },
  { href: "/team", label: "Our Team" },
  { href: "/apply", label: "Apply Now" },
];

export function MarketingFooter() {
  return (
    <footer className="mt-24 border-t border-foreground/10">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-12 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-3">
          <Image
            src="/logo-banner-tricolor.svg"
            alt="180 Degrees Consulting at UC Santa Cruz"
            width={1610}
            height={538}
            className="h-7 w-auto"
          />
          <p className="max-w-xs text-sm text-muted-foreground">
            A student-run, pro-bono consultancy connecting UC Santa Cruz
            students with nonprofits and social enterprises.
          </p>
        </div>

        <nav className="flex flex-wrap gap-x-8 gap-y-3 text-sm">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-foreground/70 transition-colors hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/login"
            className="text-foreground/70 transition-colors hover:text-foreground"
          >
            Log in
          </Link>
        </nav>
      </div>
      <div className="mx-auto max-w-6xl px-6 pb-8 text-xs text-muted-foreground">
        © {new Date().getFullYear()} 180 Degrees Consulting at UC Santa Cruz. Part of the{" "}
        <a
          href="https://180dc.org"
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 hover:text-foreground"
        >
          180 Degrees Consulting
        </a>{" "}
        global network.
      </div>
    </footer>
  );
}
