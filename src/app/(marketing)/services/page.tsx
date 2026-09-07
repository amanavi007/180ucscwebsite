import Link from "next/link";
import type { Metadata } from "next";
import { BarChart3, Handshake, LineChart, Megaphone, Search, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PhotoPlaceholder } from "@/components/marketing/photo-placeholder";
import { LogoMarquee } from "@/components/marketing/logo-marquee";

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
  { name: "American SPCC", src: "/clients/american-spcc.png" },
  { name: "Acterra", src: "/clients/acterra.png" },
  { name: "Animal Rescue Foundation", src: "/clients/animal-rescue-foundation.png" },
  { name: "Association for Women in Science (AWIS)", src: "/clients/awis.png" },
  { name: "Bay Area Legal Aid", src: "/clients/bay-area-legal-aid.png" },
  { name: "Call of the Sea", src: "/clients/call-of-the-sea.png" },
  { name: "Cat Chillin' Zone", src: "/clients/cat-chillin-zone.png" },
  { name: "Chuck Jones Center for Creativity", src: "/clients/chuck-jones-center.png" },
  { name: "digitalLIFT (formerly Community Tech Network)", src: "/clients/community-tech-network.png" },
  { name: "Compass Family Services", src: "/clients/compass-family-services.png" },
  { name: "Ditto", src: "/clients/ditto.png" },
  { name: "Encompass Community Services", src: "/clients/encompass.png" },
  { name: "Family Giving Tree", src: "/clients/family-giving-tree.png" },
  { name: "Food for the Poor", src: "/clients/food-for-the-poor.png" },
  { name: "Grad Achiever", src: "/clients/grad-achiever.png" },
  { name: "Global Brigades", src: "/clients/global-brigades.png" },
  { name: "Golden Oldies Cat Rescue", src: "/clients/golden-oldies.png" },
  { name: "Gratitude Network", src: "/clients/gratitude-network.png" },
  { name: "Habitat for Humanity", src: "/clients/habitat-for-humanity.png" },
  { name: "Habitat for Humanity East Bay/Silicon Valley", src: "/clients/habitat-eb-sv.png" },
  { name: "Habitat for Humanity Monterey Bay", src: "/clients/habitat-monterey-bay.png" },
  { name: "Illuminaid", src: "/clients/illuminaid.png" },
  { name: "KSQD", src: "/clients/ksqd.png" },
  { name: "Midpen Media Center", src: "/clients/midpen-media-center.png" },
  { name: "Napa Humane", src: "/clients/napa-humane.png" },
  { name: "Nexus Youth & Family Services", src: "/clients/nexus.png" },
  { name: "O'Neill Sea Odyssey", src: "/clients/oneill-sea-odyssey.png" },
  { name: "Open Mind School", src: "/clients/open-mind-school.png" },
  { name: "Peninsula Family Service", src: "/clients/peninsula-family-services.png" },
  { name: "Puente de la Costa Sur", src: "/clients/puente-de-la-costa-sur.png" },
  { name: "Rebuilding Together Silicon Valley", src: "/clients/rebuilding-together-sv.png" },
  { name: "Roots & Routes", src: "/clients/roots-and-routes.png" },
  { name: "Sankara Eye Foundation", src: "/clients/sankara-eye-foundation.png" },
  { name: "Santa Cruz County Animal Shelter", src: "/clients/sccas.png" },
  { name: "Santa Cruz SPCA", src: "/clients/santa-cruz-spca.png" },
  { name: "Save Our Youth", src: "/clients/save-our-youth.png" },
  { name: "Save The Frogs", src: "/clients/save-the-frogs.png" },
  { name: "Sea Otter Savvy", src: "/clients/sea-otter-savvy.png" },
  { name: "Showers for Flowers", src: "/clients/showers-for-flowers.png" },
  { name: "Single Mom Strong", src: "/clients/single-mom-strong.png" },
  { name: "SPARC Inc.", src: "/clients/sparc.png" },
  { name: "Spirit In Action", src: "/clients/spirit-in-action.png" },
  { name: "Starfall Education Foundation", src: "/clients/starfall-education-foundation.png" },
  { name: "STEM Alliance", src: "/clients/stem-alliance.png" },
  { name: "Striving For All", src: "/clients/striving.png" },
  { name: "Sunday Friends Foundation", src: "/clients/sunday-friends.png" },
  { name: "The Hero Foundation", src: "/clients/the-hero-foundation.png" },
  { name: "United Way 211 Santa Cruz County", src: "/clients/united-way-211.png" },
  { name: "Unity Care", src: "/clients/unity-care.png" },
  { name: "Walnut Avenue Family & Women's Center", src: "/clients/walnut-ave.png" },
  { name: "YES! World", src: "/clients/yes-world.png" },
];

const CLIENT_ROWS = [
  CLIENTS.filter((_, i) => i % 3 === 0),
  CLIENTS.filter((_, i) => i % 3 === 1),
  CLIENTS.filter((_, i) => i % 3 === 2),
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
      <section className="mx-auto max-w-6xl px-4 pt-14 pb-16 sm:px-6">
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

      <section className="w-full bg-mint py-16">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="font-brand text-2xl font-bold tracking-wide uppercase sm:text-3xl">What we do</h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {SERVICES.map((service) => (
              <div key={service.title} className="rounded-2xl bg-background p-6 shadow-sm">
                <service.icon className="size-6 text-primary" />
                <h3 className="mt-4 font-semibold">{service.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{service.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="font-brand text-2xl font-bold tracking-wide uppercase sm:text-3xl">
          The kind of work we take on
        </h2>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          A few illustrative examples of past engagement types. Every
          project is scoped to the client&apos;s actual need.
        </p>
        <PhotoPlaceholder
          label="Photo: consultants presenting to a client"
          src="/stock/services-presenting.jpg"
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

      <section className="w-full bg-mint py-16 sm:py-20">
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

        <div className="mt-12 space-y-6 sm:space-y-10">
          <LogoMarquee logos={CLIENT_ROWS[0]} duration={125} />
          <LogoMarquee logos={CLIENT_ROWS[1]} duration={135} reverse />
          <LogoMarquee logos={CLIENT_ROWS[2]} duration={145} />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="font-brand text-2xl font-bold tracking-wide uppercase sm:text-3xl">
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
            <h2 className="font-brand text-2xl font-bold tracking-wide uppercase sm:text-3xl">
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
