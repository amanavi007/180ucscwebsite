import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { ArrowRight, Compass, HeartHandshake, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PhotoPlaceholder } from "@/components/marketing/photo-placeholder";
import { StatsBand } from "@/components/marketing/stats-band";

export const metadata: Metadata = { title: "Home" };

const STATS: { value: string; lines: [string, string] }[] = [
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
      <section className="relative isolate flex min-h-[36rem] w-full flex-col justify-end overflow-hidden sm:min-h-[42rem] lg:min-h-[48rem]">
        <Image
          src="/stock/hero-team.jpg"
          alt="180DC UCSC chapter members collaborating"
          fill
          priority
          className="absolute inset-0 -z-20 object-cover"
        />
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black/85 via-black/45 to-black/10" />
        <div className="absolute inset-0 -z-10 bg-primary/25 mix-blend-multiply" />

        <div className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-6 sm:pb-20 lg:pb-24">
          <h1 className="font-brand text-5xl leading-[0.98] font-bold tracking-wide text-white uppercase sm:text-7xl lg:text-8xl">
            180 Degrees
            <br />
            Consulting
          </h1>
          <p className="mt-5 max-w-md text-lg text-white/80">
            World&apos;s largest student consultancy · UC Santa Cruz
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-3">
            <Button nativeButton={false} size="lg" render={<Link href="/apply" />} className="rounded-full">
              Apply Now
            </Button>
            <Button
              nativeButton={false}
              size="lg"
              variant="outline"
              className="rounded-full border-white/40 bg-white/10 text-white backdrop-blur-sm hover:bg-white/20 hover:text-white"
              render={<Link href="/services" />}
            >
              Become a Client
            </Button>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <StatsBand stats={STATS} />
      </section>

      <section className="w-full bg-mint py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="max-w-2xl">
            <h2 className="font-brand text-3xl font-bold tracking-wide uppercase sm:text-4xl">
              What we&apos;re about
            </h2>
            <p className="mt-4 text-foreground/70 text-pretty">
              We believe every organization doing important work deserves
              access to great strategy talent, not just the ones who can
              afford it. Our members spend a quarter embedded with a client,
              researching, analyzing, and building recommendations they can
              actually use.
            </p>
          </div>

          <div className="mt-12 grid gap-6 sm:grid-cols-3">
            {PILLARS.map((pillar) => (
              <div key={pillar.title} className="rounded-2xl bg-background p-6 shadow-sm">
                <pillar.icon className="size-6 text-primary" />
                <h3 className="mt-4 font-semibold">{pillar.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{pillar.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pt-16 pb-24">
        <div className="grid gap-10 sm:grid-cols-2 sm:items-center">
          <PhotoPlaceholder
            label="Photo: members working with a client"
            src="/stock/home-client-work.jpg"
            className="aspect-[4/3] w-full rounded-2xl sm:order-2"
          />
          <div>
            <h2 className="font-brand text-2xl font-bold tracking-wide uppercase sm:text-3xl">
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
    </div>
  );
}
