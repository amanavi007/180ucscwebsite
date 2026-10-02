import Link from "next/link";
import Image from "next/image";
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
      <section className="relative isolate overflow-hidden bg-deep text-white">
        <Image
          src="/stock/about-hero.jpg"
          alt="180DC UCSC members working together"
          fill
          priority
          sizes="100vw"
          className="-z-20 object-cover"
        />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#14230b]/90 via-[#14230b]/65 to-[#14230b]/30" />
        <div className="mx-auto max-w-6xl px-4 pt-40 pb-24 sm:px-6 sm:pt-44 sm:pb-28">
          <p className="text-sm font-bold tracking-wide text-[#b9dc8c] uppercase">About Us</p>
          <h1 className="font-brand mt-3 max-w-3xl text-5xl leading-[1] font-extrabold text-balance sm:text-6xl lg:text-7xl">
            A community of students who wanted their work to matter.
          </h1>
          <p className="mt-6 max-w-xl text-lg text-white/85 text-pretty">
            180 Degrees Consulting at UC Santa Cruz brings together students
            from every corner of campus, from engineering and economics to
            biology and the arts, around one shared goal: using real
            consulting skills to help mission-driven organizations grow.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
        <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
          <div className="lg:sticky lg:top-28 lg:self-start">
            <p className="text-sm font-bold tracking-wide text-primary uppercase">What we stand for</p>
            <h2 className="font-brand mt-3 text-3xl font-bold tracking-wide uppercase sm:text-4xl">Our values</h2>
            <PhotoPlaceholder
              label="180DC UCSC members candid"
              src="/stock/team-hero-candid.jpg"
              className="mt-8 aspect-[4/5] w-full rounded-[2rem]"
            />
          </div>

          <div className="lg:self-center">
            {VALUES.map((value, i) => (
              <div key={value.title} className="flex gap-5 border-t border-foreground/10 py-7 first:border-t-0 first:pt-0 sm:gap-7">
                <span className="font-brand w-12 shrink-0 text-5xl leading-none font-extrabold text-primary">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div>
                  <div className="flex items-center gap-2.5">
                    <value.icon className="size-5 text-primary" />
                    <h3 className="font-brand text-2xl font-bold">{value.title}</h3>
                  </div>
                  <p className="mt-2 text-muted-foreground text-pretty">{value.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="w-full bg-cream py-20 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <p className="text-sm font-bold tracking-wide text-primary uppercase">Our community</p>
          <h2 className="font-brand mt-3 text-3xl font-bold tracking-wide uppercase sm:text-4xl">
            Every corner of campus
          </h2>

          <div className="mt-10 grid gap-10 lg:grid-cols-2 lg:items-center lg:gap-14">
            <div className="grid h-72 grid-cols-[1.4fr_1fr] grid-rows-2 gap-3 sm:h-[22rem]">
              <PhotoPlaceholder
                label="180DC UCSC team"
                src="/stock/hero-team.jpg"
                className="row-span-2 h-full rounded-[1.5rem]"
              />
              <PhotoPlaceholder
                label="180DC UCSC client work"
                src="/stock/home-client-work.jpg"
                className="h-full rounded-[1.5rem]"
              />
              <PhotoPlaceholder
                label="180DC UCSC info session"
                src="/stock/apply-info-session.jpg"
                className="h-full rounded-[1.5rem]"
              />
            </div>

            <div>
              <p className="text-foreground/70 text-pretty">
                Our members come from every corner of campus, united by wanting
                to build real strategy skills while doing work that actually
                helps someone. Whether you&apos;re pre-business, pre-med, an
                engineer, or still figuring it out, there&apos;s a place for
                you here.
              </p>
              <div className="mt-6 flex flex-wrap gap-y-4 divide-x divide-foreground/15">
                {QUICK_FACTS.map((fact) => (
                  <div key={fact.label} className="px-6 first:pl-0 last:pr-0 sm:px-8">
                    <p className="font-brand text-lg font-bold tracking-wide text-primary uppercase">{fact.label}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{fact.detail}</p>
                  </div>
                ))}
              </div>
              <p className="mt-8 text-sm font-bold tracking-wide text-primary uppercase">Majors represented</p>
              <div className="mt-4 space-y-3">
                {MAJORS.map((major) => (
                  <div key={major.label} className="flex items-center gap-3">
                    <span className="w-36 shrink-0 truncate text-sm text-foreground/80 sm:w-40">{major.label}</span>
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
        </div>
      </section>

      <section className="relative isolate overflow-hidden bg-deep text-white">
        <Image
          src="/stock/hero-team.jpg"
          alt=""
          fill
          sizes="100vw"
          className="-z-20 object-cover"
        />
        <div className="absolute inset-0 -z-10 bg-deep/90" />
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-4 py-20 sm:flex-row sm:items-center sm:px-6">
          <div>
            <h2 className="font-brand text-3xl font-bold tracking-wide uppercase sm:text-4xl">
              Like the sound of this?
            </h2>
            <p className="mt-2 max-w-md text-white/80">
              See what we actually do for clients, or apply to join the team yourself.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-3">
            <Button
              nativeButton={false}
              size="lg"
              className="rounded-full bg-white text-deep hover:bg-white/90"
              render={<Link href="/apply" />}
            >
              Apply Now
            </Button>
            <Button
              nativeButton={false}
              size="lg"
              variant="outline"
              className="rounded-full border-white/60 bg-transparent text-white hover:bg-white/10 hover:text-white"
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
