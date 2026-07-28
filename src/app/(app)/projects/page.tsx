import type { Metadata } from "next";
import { getCurrentProfile } from "@/lib/data/profile";
import { getProjects } from "@/lib/data/projects";
import { getQuarters, getActiveQuarter } from "@/lib/data/quarters";
import { getAllProfiles } from "@/lib/data/members";
import { isExec } from "@/lib/auth/roles";
import { ProjectsView } from "./projects-view";

export const metadata: Metadata = { title: "Projects" };

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ quarter?: string }>;
}) {
  const { quarter } = await searchParams;
  const [profile, quarters, activeQuarter] = await Promise.all([
    getCurrentProfile(),
    getQuarters(),
    getActiveQuarter(),
  ]);

  const selectedQuarterId = quarter || activeQuarter?.id;
  const [projects, members] = await Promise.all([
    selectedQuarterId ? getProjects(selectedQuarterId) : Promise.resolve([]),
    isExec(profile.role) ? getAllProfiles() : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
        <p className="text-sm text-muted-foreground">
          Client projects for the selected quarter.
        </p>
      </div>

      <ProjectsView
        projects={projects}
        quarters={quarters}
        selectedQuarterId={selectedQuarterId ?? null}
        members={members}
        canCreate={isExec(profile.role)}
        currentUserId={profile.id}
        isExec={isExec(profile.role)}
      />
    </div>
  );
}
