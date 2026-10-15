import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/data/profile";
import { getProject, getProjectMembers } from "@/lib/data/projects";
import { getTasksForProject } from "@/lib/data/tasks";
import { getAllProfiles } from "@/lib/data/members";
import { isExec } from "@/lib/auth/roles";
import { isProjectLead } from "@/lib/auth/project-access";
import { computeProjectHealth } from "@/lib/project-health";
import { ProjectHeader } from "./project-header";
import { TeamRoster } from "./team-roster";
import { TaskList } from "./task-list";
import { UrlTabs } from "@/components/url-tabs";
import { TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getCurrentRubric, listReviews } from "@/lib/data/prelim-review";
import { ReviewTab } from "./review/review-tab";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  try {
    const project = await getProject(id);
    return { title: project.client_name };
  } catch {
    return { title: "Project" };
  }
}

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Independent of each other -- fetch concurrently instead of one after another.
  const [profile, projectResult] = await Promise.all([
    getCurrentProfile(),
    getProject(id)
      .then((p) => ({ ok: true as const, project: p }))
      .catch(() => ({ ok: false as const, project: undefined })),
  ]);

  if (!projectResult.ok || !projectResult.project) notFound();
  const project = projectResult.project;

  const canEdit = await isProjectLead(id, profile.id, isExec(profile.role));

  const [tasks, members, allProfiles, reviews, docRubric, slidesRubric] = await Promise.all([
    getTasksForProject(id),
    getProjectMembers(id),
    canEdit ? getAllProfiles() : Promise.resolve([]),
    listReviews(id),
    getCurrentRubric("doc"),
    getCurrentRubric("slides"),
  ]);

  const computedHealth = computeProjectHealth(project, tasks);

  // Base-tier consultants only see their own tasks, not the whole team's.
  const visibleTasks = canEdit ? tasks : tasks.filter((t) => t.assignee_id === profile.id);

  return (
    <div className="space-y-8">
      <ProjectHeader
        project={project}
        computedHealth={computedHealth}
        canEdit={canEdit}
        canDelete={isExec(profile.role)}
        members={allProfiles}
      />

      <UrlTabs values={["work", "review"]} fallback="work">
        <TabsList>
          <TabsTrigger value="work">Team and tasks</TabsTrigger>
          <TabsTrigger value="review">Prelim review</TabsTrigger>
        </TabsList>
        <TabsContent value="work" className="space-y-8">
        <TeamRoster projectId={id} members={members} allProfiles={allProfiles} canEdit={canEdit} />

        <TaskList
          projectId={id}
          tasks={visibleTasks}
          canManage={canEdit}
          currentUserId={profile.id}
          rosterProfiles={members.map((m) => m.profile).filter((p): p is NonNullable<typeof p> => !!p)}
        />
        </TabsContent>
        <TabsContent value="review">
          <ReviewTab projectId={id} reviews={reviews} rubrics={{ doc: docRubric, slides: slidesRubric }} />
        </TabsContent>
      </UrlTabs>
    </div>
  );
}
