import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/data/profile";
import { getProject, getProjectMembers } from "@/lib/data/projects";
import { getTasksForProject } from "@/lib/data/tasks";
import { getAllProfiles } from "@/lib/data/members";
import { isExec } from "@/lib/auth/roles";
import { computeProjectHealth } from "@/lib/project-health";
import { ProjectHeader } from "./project-header";
import { TeamRoster } from "./team-roster";
import { TaskList } from "./task-list";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await getCurrentProfile();

  let project;
  try {
    project = await getProject(id);
  } catch {
    notFound();
  }
  if (!project) notFound();

  const canEdit =
    isExec(profile.role) ||
    project.project_manager_id === profile.id ||
    project.senior_consultant_id === profile.id;

  const [tasks, members, allProfiles] = await Promise.all([
    getTasksForProject(id),
    getProjectMembers(id),
    canEdit ? getAllProfiles() : Promise.resolve([]),
  ]);

  const computedHealth = computeProjectHealth(project, tasks);

  return (
    <div className="space-y-8">
      <ProjectHeader
        project={project}
        computedHealth={computedHealth}
        canEdit={canEdit}
        members={allProfiles}
      />

      <TeamRoster projectId={id} members={members} allProfiles={allProfiles} canEdit={canEdit} />

      <TaskList
        projectId={id}
        tasks={tasks}
        canManage={canEdit}
        currentUserId={profile.id}
        rosterProfiles={members.map((m) => m.profile).filter((p): p is NonNullable<typeof p> => !!p)}
      />
    </div>
  );
}
