import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { BarChart3, Handshake, LineChart, Megaphone, Search, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PhotoPlaceholder } from "@/components/marketing/photo-placeholder";

export const metadata: Metadata = { title: "Our Services" };

const SERVICES = [
  {
    icon: TrendingUp,
    title: "Nonprofit Strategy",
    body: "Expansion plans, donor outreach strategy, and volunteer recruitment frameworks that scale with your mission.",
  },
  {
    icon: LineChart,
    title: "Growth Strategy",
    body: "Market entry, partnership opportunities, and go-to-market plans for organizations ready to reach more people.",
  },
  {
    icon: Search,
    title: "Market & Industry Research",
    body: "Structured research into your sector's landscape, competitors, and policy environment to ground your next move.",
  },
  {
    icon: BarChart3,
    title: "Operational Efficiency",
    body: "Process and resource-allocation reviews that free up time and budget for the work that matters most.",
  },
  {
    icon: Megaphone,
    title: "Branding & Marketing",
    body: "Positioning, messaging, and outreach strategy to help your organization's story reach the right audience.",
  },
  {
    icon: Handshake,
    title: "Impact Measurement",
    body: "Frameworks for tracking and communicating the outcomes your organization is already creating.",
  },
];

const EXAMPLE_ENGAGEMENTS = [
  {
    sector: "Environmental Nonprofit",
    body: "Developed a volunteer recruitment and retention strategy ahead of a regional program expansion.",
  },
  {
    sector: "Community Health Organization",
    body: "Conducted market research on underserved patient populations to inform a new outreach initiative.",
  },
  {
    sector: "Education-Focused Social Enterprise",
    body: "Built a go-to-market plan for a new program aimed at first-generation college students.",
  },
];

const CLIENTS = [
  { name: "Habitat for Humanity", src: "/clients/habitat-for-humanity.png" },
  { name: "Sankara Eye Foundation", src: "/clients/sankara-eye-foundation.png" },
  { name: "Family Giving Tree", src: "/clients/family-giving-tree.png" },
  { name: "Starfall Education Foundation", src: "/clients/starfall-education-foundation.png" },
  { name: "Santa Cruz SPCA", src: "/clients/santa-cruz-spca.png" },
  { name: "Animal Rescue Foundation", src: "/clients/animal-rescue-foundation.png" },
  { name: "Ditto", src: "/clients/ditto.png" },
];

// TODO: add real client testimonials (quote, name, organization) once available.
const TESTIMONIALS: { quote: string; name: string; org: string }[] = [];

function TestimonialsComingSoon() {
  return (
    <div className="rounded-2xl border border-dashed border-primary/30 bg-primary/5 p-8 text-center text-sm text-muted-foreground">
      Client testimonials coming soon.
    </div>
  );
}

export default function ServicesPage() {
  return (
    <div>
      <section className="mx-auto max-w-6xl px-4 pt-14 sm:px-6">
        <div className="mint-panel rounded-[2.5rem] p-8 sm:p-12">
          <p className="text-sm font-bold tracking-wide text-primary uppercase">Our Services</p>
          <h1 className="font-brand mt-3 max-w-2xl text-4xl leading-[1.05] font-bold tracking-tight text-balance sm:text-5xl">
            Consulting support for organizations doing good work.
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-foreground/70 text-pretty">
            We partner with nonprofits, social enterprises, and mission-driven
            teams for a full academic quarter, free of charge, to tackle a
            real strategic challenge alongside a dedicated student team.
          </p>
          <div className="mt-8">
            <Button nativeButton={false} size="lg" className="rounded-full" render={<Link href="/apply" />}>
              Become a Client
            </Button>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="font-brand text-2xl font-bold tracking-tight sm:text-3xl">What we do</h2>
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {SERVICES.map((service) => (
            <div key={service.title} className="rounded-2xl border border-primary/15 bg-primary/5 p-6">
              <service.icon className="size-6 text-primary" />
              <h3 className="mt-4 font-semibold">{service.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{service.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="font-brand text-2xl font-bold tracking-tight sm:text-3xl">
          The kind of work we take on
        </h2>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          A few illustrative examples of past engagement types. Every
          project is scoped to the client&apos;s actual need.
        </p>
        <PhotoPlaceholder
          label="Photo: consultants presenting to a client"
          className="mt-8 aspect-[21/9] w-full"
        />
        <div className="mt-8 grid gap-6 sm:grid-cols-3">
          {EXAMPLE_ENGAGEMENTS.map((eg) => (
            <div key={eg.sector} className="rounded-2xl border border-foreground/10 p-6">
              <p className="text-xs font-medium tracking-wide text-primary uppercase">{eg.sector}</p>
              <p className="mt-3 text-sm text-muted-foreground">{eg.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="mint-panel rounded-[2.5rem] p-8 sm:p-12">
          <p className="text-center text-sm font-bold tracking-wide text-primary uppercase">
            Trusted by
          </p>
          <h2 className="font-brand mt-3 text-center text-2xl font-bold tracking-tight sm:text-3xl">
            Organizations we&apos;ve worked with
          </h2>
          <p className="mx-auto mt-2 max-w-2xl text-center text-foreground/70">
            A sample of the nonprofits, social enterprises, and startups our
            consultants have partnered with.
          </p>
          <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {CLIENTS.map((client) => (
              <div
                key={client.name}
                className="flex h-28 items-center justify-center rounded-2xl bg-background p-6 shadow-sm transition-transform hover:-translate-y-0.5 hover:shadow-md"
              >
                <Image
                  src={client.src}
                  alt={client.name}
                  width={160}
                  height={64}
                  className="h-auto max-h-14 w-auto max-w-full object-contain"
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="font-brand text-2xl font-bold tracking-tight sm:text-3xl">
          What our clients say
        </h2>
        {TESTIMONIALS.length > 0 ? (
          <div className="mt-8 grid gap-6 sm:grid-cols-3">
            {TESTIMONIALS.map((testimonial) => (
              <div key={testimonial.name} className="rounded-2xl border border-primary/15 bg-primary/5 p-6">
                <p className="text-sm text-foreground/80 text-pretty">&ldquo;{testimonial.quote}&rdquo;</p>
                <p className="mt-4 text-sm font-semibold">{testimonial.name}</p>
                <p className="text-xs text-muted-foreground">{testimonial.org}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-8">
            <TestimonialsComingSoon />
          </div>
        )}
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 pb-24 sm:px-6">
        <div className="mint-panel flex flex-col items-start justify-between gap-6 rounded-[2.5rem] p-10 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-brand text-2xl font-bold tracking-tight sm:text-3xl">
              Think we could help?
            </h2>
            <p className="mt-2 max-w-md text-foreground/70">
              Tell us about your organization and what you&apos;re working
              through. We review client applications every quarter.
            </p>
          </div>
          <Button nativeButton={false} size="lg" className="shrink-0 rounded-full" render={<Link href="/apply" />}>
            Become a Client
          </Button>
        </div>
      </section>
    </div>
  );
}
