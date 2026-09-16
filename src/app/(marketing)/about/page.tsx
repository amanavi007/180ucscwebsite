import Link from "next/link";
import type { Metadata } from "next";
import { Globe2, Lightbulb, ShieldCheck, Sprout } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PhotoPlaceholder } from "@/components/marketing/photo-placeholder";

export const metadata: Metadata = { title: "About Us" };

// TODO: swap in the chapter's real major breakdown once membership data
// tracks it -- these are representative placeholder counts, not measured.
const MAJORS = [
  { label: "Economics", count: 18 },
  { label: "Computer Science", count: 15 },
  { label: "Business Management", count: 12 },
  { label: "Biology", count: 9 },
  { label: "Environmental Studies", count: 7 },
  { label: "Other majors", count: 14 },
];
const MAJORS_MAX = Math.max(...MAJORS.map((m) => m.count));

const QUICK_FACTS = [
  { label: "Pro bono", detail: "every engagement" },
  { label: "Quarterly", detail: "project cycles" },
  { label: "Global", detail: "180DC network" },
];

const VALUES = [
  {
    icon: Sprout,
    title: "Social impact, always",
    body: "We only take on clients working toward a genuine social or environmental mission: nonprofits, social enterprises, and public-good initiatives.",
  },
  {
    icon: Lightbulb,
    title: "Learning by doing",
    body: "New members are trained on real consulting frameworks, then apply them immediately on a live client engagement, not a case study.",
  },
  {
    icon: ShieldCheck,
    title: "Professional standards",
    body: "Our clients get the same rigor, timelines, and deliverables they'd expect from a paid engagement, just without the invoice.",
  },
  {
    icon: Globe2,
    title: "Part of something bigger",
    body: "As a chapter of 180 Degrees Consulting, we're connected to a global network of 170+ branches doing the same work worldwide.",
  },
];

export default function AboutPage() {
  return (
    <div>
      <section className="mx-auto max-w-6xl px-4 pt-14 pb-16 sm:px-6">
        <div className="mint-panel grid gap-10 rounded-[2.5rem] p-8 sm:p-12 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:gap-16">
          <div>
            <p className="text-sm font-bold tracking-wide text-primary uppercase">About Us</p>
            <h1 className="font-brand mt-3 max-w-2xl text-4xl leading-[1.05] font-bold tracking-tight text-balance sm:text-5xl">
              A community of students who wanted their work to matter.
            </h1>
            <p className="mt-6 max-w-2xl text-lg text-foreground/70 text-pretty">
              180 Degrees Consulting at UC Santa Cruz brings together students
              from every corner of campus, from engineering and economics to
              biology and the arts, around one shared goal: using real
              consulting skills to help mission-driven organizations grow.
            </p>
          </div>
          <PhotoPlaceholder
            label="180DC UCSC members working together"
            src="/stock/about-hero.jpg"
            className="aspect-[4/3] w-full rounded-[2rem]"
          />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="max-w-2xl">
          <p className="text-sm font-bold tracking-wide text-primary uppercase">What we stand for</p>
          <h2 className="font-brand mt-3 text-3xl font-bold tracking-wide uppercase sm:text-4xl">Our values</h2>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-2">
          {VALUES.map((value, i) => (
            <div
              key={value.title}
              className="group relative overflow-hidden rounded-2xl border border-foreground/10 p-7 transition-all hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-md"
            >
              <span className="font-brand pointer-events-none absolute -top-3 right-4 text-7xl font-bold text-primary/[0.06] transition-colors group-hover:text-primary/10">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="relative flex size-11 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <value.icon className="size-5" />
              </div>
              <h3 className="relative mt-5 font-semibold">{value.title}</h3>
              <p className="relative mt-2 text-sm text-muted-foreground">{value.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="font-brand text-2xl font-bold tracking-wide uppercase sm:text-3xl">Our community</h2>

        <div className="mt-8 grid gap-10 rounded-[2.5rem] border border-foreground/10 bg-secondary/30 p-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <p className="text-foreground/70 text-pretty">
              Our members come from every corner of campus, united by wanting
              to build real strategy skills while doing work that actually
              helps someone. Whether you&apos;re pre-business, pre-med, an
              engineer, or still figuring it out, there&apos;s a place for
              you here.
            </p>
            <div className="mt-8 flex flex-wrap gap-y-4 divide-x divide-foreground/15">
              {QUICK_FACTS.map((fact) => (
                <div key={fact.label} className="px-8 first:pl-0 last:pr-0">
                  <p className="font-brand text-lg font-bold tracking-wide text-primary uppercase">{fact.label}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{fact.detail}</p>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="text-sm font-bold tracking-wide text-primary uppercase">Majors represented</p>
            <div className="mt-4 space-y-3">
              {MAJORS.map((major) => (
                <div key={major.label} className="flex items-center gap-3">
                  <span className="w-40 shrink-0 truncate text-sm text-foreground/80">{major.label}</span>
                  <div className="h-2 flex-1 rounded-full bg-foreground/10">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${(major.count / MAJORS_MAX) * 100}%` }}
                    />
                  </div>
                  <span className="w-6 shrink-0 text-right text-sm font-semibold tabular-nums">
                    {major.count}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 pb-24 sm:px-6">
        <div className="mint-panel flex flex-col items-start justify-between gap-6 rounded-[2.5rem] p-10 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-brand text-2xl font-bold tracking-wide uppercase sm:text-3xl">
              Like the sound of this?
            </h2>
            <p className="mt-2 max-w-md text-foreground/70">
              See what we actually do for clients, or apply to join the team yourself.
            </p>
          </div>
          <div className="flex shrink-0 gap-3">
            <Button nativeButton={false} size="lg" className="rounded-full" render={<Link href="/apply" />}>
              Apply Now
            </Button>
            <Button
              nativeButton={false}
              size="lg"
              variant="outline"
              className="rounded-full"
              render={<Link href="/services" />}
            >
              Our Services
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
