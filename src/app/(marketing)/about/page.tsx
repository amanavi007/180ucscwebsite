import type { Metadata } from "next";
import { Globe2, Lightbulb, ShieldCheck, Sprout } from "lucide-react";
import { PhotoPlaceholder } from "@/components/marketing/photo-placeholder";

export const metadata: Metadata = { title: "About Us" };

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
      <section className="mx-auto max-w-6xl px-4 pt-14 sm:px-6">
        <div className="mint-panel rounded-[2.5rem] p-8 sm:p-12">
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
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="font-brand text-2xl font-bold tracking-tight sm:text-3xl">Our values</h2>
        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          {VALUES.map((value) => (
            <div key={value.title} className="rounded-2xl border border-primary/15 bg-primary/5 p-6">
              <value.icon className="size-6 text-primary" />
              <h3 className="mt-4 font-semibold">{value.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{value.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="font-brand text-2xl font-bold tracking-tight sm:text-3xl">Our community</h2>
        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <PhotoPlaceholder
            label="Photo: a general meeting"
            src="/stock/about-general-meeting.jpg"
            className="aspect-square"
          />
          <PhotoPlaceholder
            label="Photo: a client working session"
            src="/stock/about-client-session.jpg"
            className="aspect-square"
          />
          <PhotoPlaceholder
            label="Photo: a project team"
            src="/stock/about-project-team.jpg"
            className="aspect-square"
          />
          <PhotoPlaceholder
            label="Photo: a social event"
            src="/stock/about-social-event.jpg"
            className="aspect-square"
          />
        </div>

        <div className="mint-panel mt-6 grid gap-10 rounded-[2.5rem] p-10 sm:grid-cols-2 sm:items-center">
          <div>
            <p className="mt-1 text-foreground/70 text-pretty">
              {/* TODO: swap in the chapter's real member count, majors represented,
                  and founding year once available. */}
              Our members come from a wide range of majors and backgrounds,
              but share a common drive: to build real strategy skills while
              doing work that actually helps someone. Whether you&apos;re
              pre-business, pre-med, an engineer, or still figuring it out,
              there&apos;s a place for you here.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-2xl border border-foreground/10 bg-background/60 p-5">
              <p className="font-brand text-2xl font-bold text-primary">Every major</p>
              <p className="mt-1 text-sm text-muted-foreground">welcome to apply</p>
            </div>
            <div className="rounded-2xl border border-foreground/10 bg-background/60 p-5">
              <p className="font-brand text-2xl font-bold text-primary">Pro bono</p>
              <p className="mt-1 text-sm text-muted-foreground">every engagement</p>
            </div>
            <div className="rounded-2xl border border-foreground/10 bg-background/60 p-5">
              <p className="font-brand text-2xl font-bold text-primary">Quarterly</p>
              <p className="mt-1 text-sm text-muted-foreground">project cycles</p>
            </div>
            <div className="rounded-2xl border border-foreground/10 bg-background/60 p-5">
              <p className="font-brand text-2xl font-bold text-primary">Global</p>
              <p className="mt-1 text-sm text-muted-foreground">180DC network</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
