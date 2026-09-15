import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { PhotoPlaceholder } from "@/components/marketing/photo-placeholder";

export const metadata: Metadata = { title: "Our Team" };

function LinkedinIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M20.45 20.45h-3.55v-5.57c0-1.33-.02-3.03-1.85-3.03-1.85 0-2.14 1.45-2.14 2.94v5.66H9.36V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM7.12 20.45H3.56V9h3.56v11.45z" />
    </svg>
  );
}

const EXEC_BOARD = [
  { name: "Sudheeksha Nettam", role: "President", linkedin: "https://www.linkedin.com/in/sudheeksha-nettam-702751347/" },
  { name: "Aman Avinash", role: "Director of Projects", linkedin: "https://www.linkedin.com/in/amanavi007/" },
  { name: "Aanya Agarwal", role: "Director of Internal Affairs", linkedin: "https://www.linkedin.com/in/aanya-agarwal9/" },
  { name: "Devarsh Jayakrishnan", role: "Director of External Affairs", linkedin: "https://www.linkedin.com/in/devarshjayakrishnan/" },
  { name: "Ramki Krish", role: "Director of Training", linkedin: "https://www.linkedin.com/in/ramkiran-krish-2bba97236/" },
  { name: "Mallika Sinha", role: "Director of Marketing", linkedin: "https://www.linkedin.com/in/mallikasinha123/" },
];

// TODO: add the real project manager roster (name, major, LinkedIn) once available.
const PROJECT_MANAGERS: { name: string; major: string; linkedin?: string }[] = [];

// TODO: add the real consultant roster (name, major, LinkedIn) once available.
const CONSULTANTS: { name: string; major: string; linkedin?: string }[] = [];

function MemberCard({
  name,
  subtitle,
  linkedin,
}: {
  name: string;
  subtitle: string;
  linkedin?: string;
}) {
  return (
    <div className="rounded-2xl border border-primary/15 bg-primary/5 p-6 text-center">
      <PhotoPlaceholder label={`Photo: ${name}`} shape="circle" iconOnly className="mx-auto size-24" />
      <h3 className="mt-4 font-semibold">{name}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      {linkedin ? (
        <a
          href={linkedin}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
        >
          <LinkedinIcon className="size-3.5" />
          LinkedIn
        </a>
      ) : (
        <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground/50">
          <LinkedinIcon className="size-3.5" />
          LinkedIn
        </p>
      )}
    </div>
  );
}

function RosterComingSoon({ label }: { label: string }) {
  return <p className="py-4 text-sm text-muted-foreground/70">{label} roster coming soon.</p>;
}

export default function TeamPage() {
  return (
    <div>
      <section className="relative isolate flex min-h-[20rem] w-full flex-col justify-end overflow-hidden sm:min-h-[24rem] lg:min-h-[28rem]">
        <Image
          src="/stock/team-hero-candid.jpg"
          alt="180DC UCSC chapter members"
          fill
          priority
          className="absolute inset-0 -z-20 object-cover"
        />
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black/80 via-black/35 to-black/10" />
        <div className="absolute inset-0 -z-10 bg-primary/20 mix-blend-multiply" />

        <div className="mx-auto w-full max-w-6xl px-4 pb-10 sm:px-6 sm:pb-14">
          <p className="text-sm font-bold tracking-wide text-white/80 uppercase">Our Team</p>
          <h1 className="font-brand mt-2 max-w-2xl text-4xl leading-[1.05] font-bold tracking-wide text-balance text-white uppercase sm:text-5xl lg:text-6xl">
            Meet the people behind the work.
          </h1>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pt-10 sm:px-6">
        <p className="max-w-2xl text-lg text-foreground/70 text-pretty">
          Our chapter runs on student consultants, project managers, and an
          executive board, every one of them balancing a full course load
          with real client work.
        </p>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="font-brand text-2xl font-bold tracking-wide uppercase sm:text-3xl">
          Executive Board
        </h2>
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {EXEC_BOARD.map((member) => (
            <MemberCard key={member.name} name={member.name} subtitle={member.role} linkedin={member.linkedin} />
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="font-brand text-2xl font-bold tracking-wide uppercase sm:text-3xl">
          Project Managers
        </h2>
        {PROJECT_MANAGERS.length > 0 ? (
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {PROJECT_MANAGERS.map((member) => (
              <MemberCard key={member.name} name={member.name} subtitle={member.major} linkedin={member.linkedin} />
            ))}
          </div>
        ) : (
          <div className="mt-8">
            <RosterComingSoon label="Project manager" />
          </div>
        )}
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="font-brand text-2xl font-bold tracking-wide uppercase sm:text-3xl">
          Consultants
        </h2>
        {CONSULTANTS.length > 0 ? (
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {CONSULTANTS.map((member) => (
              <MemberCard key={member.name} name={member.name} subtitle={member.major} linkedin={member.linkedin} />
            ))}
          </div>
        ) : (
          <div className="mt-8">
            <RosterComingSoon label="Consultant" />
          </div>
        )}
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 pb-24 sm:px-6">
        <div className="mint-panel flex flex-col items-start justify-between gap-6 rounded-[2.5rem] p-10 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-brand text-2xl font-bold tracking-wide uppercase sm:text-3xl">
              Want to be part of the next team?
            </h2>
            <p className="mt-2 max-w-md text-foreground/70">
              Every project manager and consultant here started the same way
              you would: an application and an interview.
            </p>
          </div>
          <Button nativeButton={false} size="lg" className="shrink-0 rounded-full" render={<Link href="/apply" />}>
            Apply Now
          </Button>
        </div>
      </section>
    </div>
  );
}
