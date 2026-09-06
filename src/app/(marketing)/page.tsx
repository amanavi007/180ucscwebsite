import Link from "next/link";
import type { Metadata } from "next";
import { ArrowUpRight, Compass, HeartHandshake, Sparkles, Users } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Home" };

const STATS = [
  { value: "180+", label: "Universities worldwide" },
  { value: "35+", label: "Countries with a 180DC presence" },
  { value: "20+", label: "Years of pro-bono consulting" },
  { value: "10,000+", label: "Student consultants globally" },
];

const PILLARS = [
  {
    icon: HeartHandshake,
    title: "Social impact first",
    body: "Every engagement exists to help a mission-driven organization do more good, not to pad a resume line.",
  },
  {
    icon: Compass,
    title: "Real consulting rigor",
    body: "Structured problem-solving, market research, and strategy work -- the same toolkit top firms use, applied pro bono.",
  },
  {
    icon: Users,
    title: "A community, not a club",
    body: "Members come from every major on campus, united by wanting their work in college to actually matter.",
  },
];

export default function HomePage() {
  return (
    <div>
      <section className="mx-auto max-w-6xl px-6 pt-20 pb-24 sm:pt-28">
        <div className="max-w-3xl">
          <p className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-medium tracking-wide text-primary uppercase">
            <Sparkles className="size-3.5" />
            UC Santa Cruz Chapter
          </p>
          <h1 className="font-brand mt-6 text-4xl leading-[1.1] font-bold tracking-tight text-balance sm:text-6xl">
            Turning good organizations into great ones.
          </h1>
          <p className="mt-6 max-w-xl text-lg text-muted-foreground text-pretty">
            180 Degrees Consulting is the world&apos;s largest student
            consultancy. Our UC Santa Cruz chapter pairs student consultants
            with nonprofits and social enterprises, pro bono, to solve real
            strategy and growth challenges.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-3">
            <Button nativeButton={false} size="lg" render={<Link href="/apply" />} className="gap-1.5">
              Apply Now
              <ArrowUpRight className="size-4" />
            </Button>
            <Button nativeButton={false} size="lg" variant="outline" render={<Link href="/services" />}>
              Become a Client
            </Button>
          </div>
        </div>
      </section>

      <section className="border-y border-foreground/10 bg-foreground/[0.02]">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-8 px-6 py-12 sm:grid-cols-4">
          {STATS.map((stat) => (
            <div key={stat.label}>
              <p className="font-brand text-3xl font-bold text-primary sm:text-4xl">{stat.value}</p>
              <p className="mt-1 text-sm text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-24">
        <div className="max-w-2xl">
          <h2 className="font-brand text-3xl font-bold tracking-tight sm:text-4xl">
            What we&apos;re about
          </h2>
          <p className="mt-4 text-muted-foreground text-pretty">
            We believe every organization doing important work deserves
            access to great strategy talent -- not just the ones who can
            afford it. Our members spend a quarter embedded with a client,
            researching, analyzing, and building recommendations they can
            actually use.
          </p>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-3">
          {PILLARS.map((pillar) => (
            <div key={pillar.title} className="glass-panel rounded-2xl p-6">
              <pillar.icon className="size-6 text-primary" />
              <h3 className="mt-4 font-semibold">{pillar.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{pillar.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-24">
        <div className="glass-panel flex flex-col items-start justify-between gap-6 rounded-3xl p-10 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-brand text-2xl font-bold tracking-tight sm:text-3xl">
              Ready to get involved?
            </h2>
            <p className="mt-2 max-w-md text-muted-foreground">
              Whether you want to join as a consultant or bring us on as a
              client, we&apos;d love to hear from you.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-3">
            <Button nativeButton={false} size="lg" render={<Link href="/apply" />}>
              Apply Now
            </Button>
            <Button nativeButton={false} size="lg" variant="outline" render={<Link href="/about" />}>
              Learn More
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
