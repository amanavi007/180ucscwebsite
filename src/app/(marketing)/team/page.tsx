import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { TeamMemberCard } from "@/components/marketing/team-member-card";
import { getPublicTeamMembers } from "@/lib/data/team-page";
import { groupTeamMembers, memberSubtitle, type PublicTeamMember, type TeamSection } from "@/lib/team-page";

export const metadata: Metadata = { title: "Our Team" };

function RosterComingSoon({ label }: { label: string }) {
  return <p className="py-4 text-sm text-muted-foreground/70">{label} roster coming soon.</p>;
}

function Roster({
  section,
  members,
  emptyLabel,
  cols,
  cardClassName,
}: {
  section: TeamSection;
  members: PublicTeamMember[];
  emptyLabel: string;
  cols: string;
  cardClassName?: string;
}) {
  if (members.length === 0) {
    return (
      <div className="mt-8">
        <RosterComingSoon label={emptyLabel} />
      </div>
    );
  }
  return (
    <div className={`mt-8 grid gap-x-6 gap-y-10 sm:grid-cols-2 ${cols}`}>
      {members.map((m) => (
        <TeamMemberCard
          key={m.id}
          name={m.name}
          subtitle={memberSubtitle(section, m)}
          bio={m.bio}
          linkedin={m.linkedinUrl}
          photoUrl={m.photoUrl}
          className={cardClassName}
        />
      ))}
    </div>
  );
}

export default async function TeamPage() {
  const groups = groupTeamMembers(await getPublicTeamMembers());
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
        <Roster section="exec" members={groups.exec} emptyLabel="Executive board" cols="lg:grid-cols-3" cardClassName="lg:max-w-[19rem]" />
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="font-brand text-2xl font-bold tracking-wide uppercase sm:text-3xl">
          Project Managers
        </h2>
        <Roster section="project_manager" members={groups.project_manager} emptyLabel="Project manager" cols="lg:grid-cols-4" />
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="font-brand text-2xl font-bold tracking-wide uppercase sm:text-3xl">
          Consultants
        </h2>
        <Roster section="consultant" members={groups.consultant} emptyLabel="Consultant" cols="lg:grid-cols-4" />
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
