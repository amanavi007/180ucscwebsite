import Link from "next/link";
import type { Metadata } from "next";
import { ArrowUpRight, BarChart3, Handshake, LineChart, Megaphone, Search, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";

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

export default function ServicesPage() {
  return (
    <div>
      <section className="mx-auto max-w-6xl px-6 pt-20 pb-16 sm:pt-28">
        <p className="text-sm font-medium tracking-wide text-primary uppercase">Our Services</p>
        <h1 className="font-brand mt-3 max-w-2xl text-4xl leading-[1.1] font-bold tracking-tight text-balance sm:text-5xl">
          Consulting support for organizations doing good work.
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-muted-foreground text-pretty">
          We partner with nonprofits, social enterprises, and mission-driven
          teams for a full academic quarter -- free of charge -- to tackle a
          real strategic challenge alongside a dedicated student team.
        </p>
        <div className="mt-8">
          <Button nativeButton={false} size="lg" render={<Link href="/apply" />} className="gap-1.5">
            Become a Client
            <ArrowUpRight className="size-4" />
          </Button>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="font-brand text-2xl font-bold tracking-tight sm:text-3xl">What we do</h2>
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {SERVICES.map((service) => (
            <div key={service.title} className="glass-panel rounded-2xl p-6">
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
          A few illustrative examples of past engagement types -- every
          project is scoped to the client&apos;s actual need.
        </p>
        <div className="mt-8 grid gap-6 sm:grid-cols-3">
          {EXAMPLE_ENGAGEMENTS.map((eg) => (
            <div key={eg.sector} className="rounded-2xl border border-foreground/10 p-6">
              <p className="text-xs font-medium tracking-wide text-primary uppercase">{eg.sector}</p>
              <p className="mt-3 text-sm text-muted-foreground">{eg.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16 pb-24">
        <div className="glass-panel flex flex-col items-start justify-between gap-6 rounded-3xl p-10 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-brand text-2xl font-bold tracking-tight sm:text-3xl">
              Think we could help?
            </h2>
            <p className="mt-2 max-w-md text-muted-foreground">
              Tell us about your organization and what you&apos;re working
              through -- we review client applications every quarter.
            </p>
          </div>
          <Button nativeButton={false} size="lg" render={<Link href="/apply" />} className="shrink-0">
            Become a Client
          </Button>
        </div>
      </section>
    </div>
  );
}
