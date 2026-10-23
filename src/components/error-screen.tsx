import Image from "next/image";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ErrorVariant = "not-found" | "error" | "forbidden" | "expired";

const COPY: Record<
  ErrorVariant,
  {
    chip: string;
    chipVariant: "warn" | "bad" | "info";
    title: string;
    body: string;
    globe: string;
    action: string;
  }
> = {
  "not-found": {
    chip: "404",
    chipVariant: "warn",
    title: "You rolled to the wrong place",
    body: "We looked all over the world and this page isn't on it.",
    globe: "error-globe-lost",
    action: "Roll back home",
  },
  error: {
    chip: "500",
    chipVariant: "bad",
    title: "Our world just stopped turning",
    body: "Something broke on our end, not yours. Give it another spin.",
    globe: "error-globe-broken",
    action: "Try again",
  },
  forbidden: {
    chip: "403",
    chipVariant: "info",
    title: "This part of the globe is exec-only",
    body: "Your account doesn't have access here. Ask your director if you think it should.",
    globe: "error-globe-locked",
    action: "Back to portal",
  },
  expired: {
    chip: "Signed out",
    chipVariant: "warn",
    title: "Time flies when you're consulting",
    body: "Your session ran out. Sign in again to pick up where you left off.",
    globe: "error-globe-idle",
    action: "Sign in",
  },
};

type Action = { href: string } | { onClick: () => void };

/**
 * Full-page error state with the globe as mascot. One main button; the optional
 * home link is a quiet ghost button beside it. Works in server and client components.
 */
export function ErrorScreen({
  variant,
  action,
  homeHref,
  digest,
  inShell = false,
}: {
  variant: ErrorVariant;
  /** The main button: a link, or a retry handler. */
  action: Action;
  /** Adds a quiet "Home" link next to the main button. */
  homeHref?: string;
  /** Server error id, shown small so a member can quote it. */
  digest?: string;
  /** True when rendered inside the portal shell, so it doesn't claim the whole screen. */
  inShell?: boolean;
}) {
  const copy = COPY[variant];
  const Tag = inShell ? "div" : "main";
  return (
    <Tag
      className={cn(
        "flex flex-col items-center justify-center px-6 py-16 text-center",
        inShell ? "min-h-[60vh]" : "min-h-svh bg-background text-foreground",
      )}
    >
      <Image
        src="/logo-icon.png"
        alt=""
        width={96}
        height={98}
        priority
        className={cn("h-auto w-24", copy.globe)}
      />
      <Badge variant={copy.chipVariant} className="mt-6">
        {copy.chip}
      </Badge>
      <h1 className="mt-3 max-w-md text-3xl leading-tight sm:text-4xl">{copy.title}</h1>
      <p className="mt-2 max-w-sm text-base text-muted-foreground">{copy.body}</p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        {"href" in action ? (
          <Link href={action.href} className={buttonVariants({ size: "lg" })}>
            {copy.action}
          </Link>
        ) : (
          <button type="button" onClick={action.onClick} className={buttonVariants({ size: "lg" })}>
            {copy.action}
          </button>
        )}
        {homeHref && (
          <Link href={homeHref} className={buttonVariants({ variant: "ghost", size: "lg" })}>
            Home
          </Link>
        )}
      </div>
      {digest && <p className="mt-6 text-xs text-muted-foreground">Error ID: {digest}</p>}
    </Tag>
  );
}
