import type { Metadata } from "next";
import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LogoMarquee } from "@/components/marketing/logo-marquee";
import { CLIENTS } from "@/lib/clients";
import { ProjectTimeline } from "@/components/marketing/project-timeline";
import { ServiceSpotlight } from "@/components/marketing/service-spotlight";

export const metadata: Metadata = { title: "Our Services" };

const CLIENT_FORM_URL = "https://calendly.com/d/d34j-2dp-7c7/ucsc-180-degrees-consulting-client-outreach-intro-call";

// Contiguous chunks (not an interleaved i % 3 split) so that related/adjacent
// entries -- e.g. the three separate Habitat for Humanity chapters -- land in
// the same row instead of one per row, which reads as the same org repeating
// across the whole section.
const ROW_SIZE = Math.ceil(CLIENTS.length / 3);
const CLIENT_ROWS = [
  CLIENTS.slice(0, ROW_SIZE),
  CLIENTS.slice(ROW_SIZE, ROW_SIZE * 2),
  CLIENTS.slice(ROW_SIZE * 2),
];

// TODO: swap this placeholder for a real client testimonial once one is on
// file -- the quote and org below are illustrative, not an actual client.
const TESTIMONIAL = {
  quote:
    "Our team came in expecting a generic slide deck and left with a donor segmentation model we actually use every month. They asked sharper questions about our budget constraints than consultants we've paid for in the past.",
  name: "Priya Nair",
  org: "Program Director, Monarch Grove Youth Alliance",
};

export default function ServicesPage() {
  return (
    <div>
      <section className="relative w-full overflow-hidden bg-mint pt-32 pb-14 sm:pt-36 sm:pb-16">
        <div aria-hidden className="absolute -top-10 -right-16 size-72 rounded-full bg-primary/10" />
        <div aria-hidden className="absolute -bottom-24 right-36 hidden size-44 rounded-full bg-white/50 sm:block" />
        <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
          <p className="text-sm font-bold tracking-wide text-primary uppercase">Our Services</p>
          <h1 className="font-brand mt-3 max-w-2xl text-4xl leading-[1.05] font-bold tracking-tight text-balance sm:text-5xl lg:text-6xl">
            Consulting support for organizations doing good work.
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-foreground/70 text-pretty">
            We partner with nonprofits, social enterprises, and mission-driven
            teams for a full academic quarter, free of charge, to tackle a
            real strategic challenge alongside a dedicated student team.
          </p>
          <div className="mt-8">
            <Button
              nativeButton={false}
              size="lg"
              className="gap-1.5 rounded-full"
              render={<a href={CLIENT_FORM_URL} target="_blank" rel="noopener noreferrer" />}
            >
              Become a Client
              <ArrowUpRight className="size-4" />
            </Button>
          </div>
        </div>
      </section>

      {/* Full-bleed: the list lines up with the other sections on the left while
          the dark detail panel runs off the right edge on large screens. */}
      <section className="w-full bg-cream py-14 sm:py-16">
        <div className="px-4 sm:px-6 lg:pr-0 lg:pl-[max(1.5rem,calc(50vw-34.5rem))]">
          <p className="text-sm font-bold tracking-wide text-primary uppercase">What we do</p>
          <h2 className="font-brand mt-3 text-3xl font-bold tracking-wide uppercase sm:text-4xl">
            Six ways we can help
          </h2>
          <ServiceSpotlight />
        </div>
      </section>

      <section className="w-full bg-background py-14 sm:py-16">
        <div className="mx-auto grid max-w-6xl items-start gap-10 px-4 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
          <div className="lg:sticky lg:top-28">
            <p className="text-sm font-bold tracking-wide text-primary uppercase">The process</p>
            <h2 className="font-brand mt-3 text-3xl font-bold tracking-wide uppercase sm:text-4xl">
              How a project works
            </h2>
            <p className="mt-3 max-w-md text-foreground/70 text-pretty">
              One quarter, one dedicated student team, and a deliverable you can actually use.
            </p>
          </div>
          <ProjectTimeline />
        </div>
      </section>

      <section className="w-full bg-mint py-14 sm:py-16">
        <div className="mx-auto max-w-2xl px-4 text-center sm:px-6">
          <p className="text-sm font-bold tracking-wide text-primary uppercase">Trusted by</p>
          <h2 className="font-brand mt-3 text-2xl font-bold tracking-wide uppercase sm:text-3xl">
            Organizations we&apos;ve worked with
          </h2>
          <p className="mt-2 text-foreground/70">
            A sample of the nonprofits, social enterprises, and startups our
            consultants have partnered with.
          </p>
        </div>

        <div className="mt-10 space-y-6 sm:space-y-8">
          <LogoMarquee logos={CLIENT_ROWS[0]} duration={125} />
          <LogoMarquee logos={CLIENT_ROWS[1]} duration={135} reverse />
          <LogoMarquee logos={CLIENT_ROWS[2]} duration={145} />
        </div>
      </section>

      <section className="w-full bg-deep py-14 text-white sm:py-16">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-[1.5fr_1fr] lg:gap-12">
          <div>
            <p className="text-sm font-bold tracking-wide text-[#b9dc8c] uppercase">What our clients say</p>
            <p className="font-brand mt-4 text-2xl leading-snug font-medium text-balance sm:text-3xl">
              &ldquo;{TESTIMONIAL.quote}&rdquo;
            </p>
            <p className="mt-6 text-sm font-semibold">{TESTIMONIAL.name}</p>
            <p className="text-xs text-white/70">{TESTIMONIAL.org}</p>
          </div>
          <div className="lg:border-l lg:border-white/20 lg:pl-10">
            <h2 className="font-brand text-2xl font-bold tracking-wide uppercase sm:text-3xl">Think we could help?</h2>
            <p className="mt-2 max-w-md text-white/80">
              Tell us about your organization and what you&apos;re working
              through. We review client applications every quarter.
            </p>
            <Button
              nativeButton={false}
              size="lg"
              className="mt-6 gap-1.5 rounded-full bg-white text-deep hover:bg-white/90"
              render={<a href={CLIENT_FORM_URL} target="_blank" rel="noopener noreferrer" />}
            >
              Become a Client
              <ArrowUpRight className="size-4" />
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
