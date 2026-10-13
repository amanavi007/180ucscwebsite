import Image from "next/image";

/** Split layout shared by the sign-in and set-password screens: brand panel on the left, the form on the right. */
export function AuthShell({
  headline,
  tagline,
  footnote,
  accent = "lime",
  children,
}: {
  headline: string;
  tagline: string;
  footnote: string;
  /** Which color the big circle in the brand panel uses. */
  accent?: "lime" | "lilac";
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-h-svh bg-background lg:grid-cols-[1.05fr_1fr]">
      <section
        aria-label="180 Degrees Consulting"
        className="relative hidden flex-col justify-between overflow-hidden bg-sidebar p-16 text-sidebar-foreground lg:flex"
      >
        <div aria-hidden className="absolute -top-40 -right-44 size-[520px] rounded-full bg-sidebar-accent" />
        <div
          aria-hidden
          className={`absolute -bottom-28 right-20 size-[300px] rounded-full ${accent === "lime" ? "bg-primary" : "bg-status-info"}`}
        />
        <div
          aria-hidden
          className={`absolute top-[46%] left-[340px] size-[120px] rounded-full ${accent === "lime" ? "bg-status-warn" : "bg-primary"}`}
        />

        <Image
          src="/logo-banner-light.svg"
          alt="180 Degrees Consulting UC Santa Cruz"
          width={1610}
          height={538}
          priority
          className="relative h-20 w-auto self-start"
        />

        <div className="relative max-w-xl">
          <h1 className="text-6xl leading-[1.02] font-extrabold tracking-[-0.035em] text-balance">{headline}</h1>
          <p className="mt-5 max-w-md text-lg leading-relaxed text-sidebar-foreground/80">{tagline}</p>
        </div>

        <p className="relative text-sm text-sidebar-foreground/60">{footnote}</p>
      </section>

      <section className="flex items-center justify-center px-6 py-12 sm:px-12">
        <div className="w-full max-w-100">
          <Image
            src="/logo-banner-dark.svg"
            alt="180 Degrees Consulting UC Santa Cruz"
            width={1610}
            height={538}
            priority
            className="mb-10 h-16 w-auto lg:hidden"
          />
          {children}
        </div>
      </section>
    </div>
  );
}
