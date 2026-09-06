import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, Compass, HeartHandshake, Sparkles, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PhotoPlaceholder } from "@/components/marketing/photo-placeholder";

export const metadata: Metadata = { title: "Home" };

const STATS = [
  { value: "180+", lines: ["Universities", "worldwide"] },
  { value: "35+", lines: ["Countries with a", "180DC presence"] },
  { value: "20+", lines: ["Years of pro-bono", "consulting"] },
  { value: "10,000+", lines: ["Student consultants", "globally"] },
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
    body: "Structured problem-solving, market research, and strategy work: the same toolkit top firms use, applied pro bono.",
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
      <section className="mx-auto max-w-6xl px-4 pt-14 sm:px-6">
        <div className="mint-panel grid gap-10 rounded-[2.5rem] p-8 sm:p-12 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:gap-16 lg:p-16">
          <div>
            <p className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-background/70 px-3 py-1 text-xs font-bold tracking-wide text-primary uppercase">
              <Sparkles className="size-3.5" />
              UC Santa Cruz Chapter
            </p>
            <h1 className="font-brand mt-6 text-4xl leading-[1.05] font-bold tracking-tight text-balance sm:text-6xl">
              Turning good organizations into great ones.
            </h1>
            <p className="mt-6 max-w-xl text-lg text-foreground/70 text-pretty">
              180 Degrees Consulting is the world&apos;s largest student
              consultancy. Our UC Santa Cruz chapter pairs student consultants
              with nonprofits and social enterprises, pro bono, to solve real
              strategy and growth challenges.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-3">
              <Button nativeButton={false} size="lg" render={<Link href="/apply" />} className="rounded-full">
                Apply Now
              </Button>
              <Button
                nativeButton={false}
                size="lg"
                variant="outline"
                className="rounded-full bg-background/70"
                render={<Link href="/services" />}
              >
                Become a Client
              </Button>
            </div>
          </div>
          <PhotoPlaceholder
            label="Photo: chapter members at a team meeting"
            className="aspect-[4/5] w-full rounded-[2rem] lg:aspect-auto lg:h-full lg:min-h-96"
          />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="bg-primary rounded-[2.5rem] px-8 py-14 sm:px-14 sm:py-16">
          <div className="grid grid-cols-2 gap-y-10 sm:grid-cols-4 sm:divide-x sm:divide-primary-foreground/20">
            {STATS.map((stat) => (
              <div key={stat.value} className="text-center sm:px-6">
                <p className="font-brand text-5xl font-bold text-primary-foreground sm:text-6xl">{stat.value}</p>
                <p className="mt-2 text-sm font-medium tracking-wide text-primary-foreground uppercase">
                  {stat.lines[0]}
                  <br />
                  {stat.lines[1]}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-24">
        <div className="max-w-2xl">
          <h2 className="font-brand text-3xl font-bold tracking-tight sm:text-4xl">
            What we&apos;re about
          </h2>
          <p className="mt-4 text-muted-foreground text-pretty">
            We believe every organization doing important work deserves
            access to great strategy talent, not just the ones who can
            afford it. Our members spend a quarter embedded with a client,
            researching, analyzing, and building recommendations they can
            actually use.
          </p>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-3">
          {PILLARS.map((pillar) => (
            <div key={pillar.title} className="rounded-2xl border border-primary/15 bg-primary/5 p-6">
              <pillar.icon className="size-6 text-primary" />
              <h3 className="mt-4 font-semibold">{pillar.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{pillar.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-10 sm:grid-cols-2 sm:items-center">
          <PhotoPlaceholder
            label="Photo: members working with a client"
            className="aspect-[4/3] w-full rounded-2xl sm:order-2"
          />
          <div>
            <h2 className="font-brand text-2xl font-bold tracking-tight sm:text-3xl">
              The people behind the work
            </h2>
            <p className="mt-4 text-muted-foreground text-pretty">
              Behind every client engagement is a small team of students
              putting in the hours: researching an industry, running a
              client meeting, building a deck that actually gets used.
            </p>
            <Button
              nativeButton={false}
              variant="outline"
              className="mt-6 gap-1.5 rounded-full"
              render={<Link href="/team" />}
            >
              Meet the team
              <ArrowRight className="size-4" />
            </Button>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
        <div className="mint-panel flex flex-col items-start justify-between gap-6 rounded-[2.5rem] p-10 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-brand text-2xl font-bold tracking-tight sm:text-3xl">
              Ready to get involved?
            </h2>
            <p className="mt-2 max-w-md text-foreground/70">
              Whether you want to join as a consultant or bring us on as a
              client, we&apos;d love to hear from you.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-3">
            <Button nativeButton={false} size="lg" className="rounded-full" render={<Link href="/apply" />}>
              Apply Now
            </Button>
            <Button
              nativeButton={false}
              size="lg"
              variant="outline"
              className="rounded-full bg-background/70"
              render={<Link href="/about" />}
            >
              Learn More
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
