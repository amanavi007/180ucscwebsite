import type { Metadata } from "next";
import { getCurrentProfile } from "@/lib/data/profile";
import { getProjects } from "@/lib/data/projects";
import { getQuarters, getActiveQuarter } from "@/lib/data/quarters";
import { getAllProfiles } from "@/lib/data/members";
import { isExec } from "@/lib/auth/roles";
import { LinkSwitch } from "@/components/link-switch";
import { PageHeader } from "@/components/page-header";
import { ProjectsView } from "./projects-view";

export const metadata: Metadata = { title: "Projects" };

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ quarter?: string; view?: string }>;
}) {
  const { quarter, view } = await searchParams;
  const selectedView = view === "table" ? "table" : "board";
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
      <PageHeader title="Projects" description="Client projects for the selected quarter.">
        <LinkSwitch
          className="mt-4"
          label="Projects views"
          items={[
            { href: "/portal/projects", label: "Projects", active: true },
            { href: "/portal/tasks", label: "My tasks", active: false },
          ]}
        />
      </PageHeader>

      <ProjectsView
        projects={projects}
        quarters={quarters}
        selectedQuarterId={selectedQuarterId ?? null}
        members={members}
        canCreate={isExec(profile.role)}
        currentUserId={profile.id}
        isExec={isExec(profile.role)}
        view={selectedView}
      />
    </div>
  );
}
