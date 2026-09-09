import type { Metadata } from "next";
import { getCurrentProfile } from "@/lib/data/profile";
import { getVisibleTasks } from "@/lib/data/tasks";
import { getProjects } from "@/lib/data/projects";
import { isExec, isElevatedOrAbove } from "@/lib/auth/roles";
import { TasksView } from "./tasks-view";

export const metadata: Metadata = { title: "Tasks" };

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{
    mine?: string;
    project?: string;
    status?: string;
    type?: string;
  }>;
}) {
  const params = await searchParams;
  const profile = await getCurrentProfile();
  const canViewAll = isElevatedOrAbove(profile.role);

  // Base-tier consultants only ever see their own tasks -- ignore the "mine" param for them.
  const mine = canViewAll ? params.mine !== "0" : true;

  const [tasks, projects] = await Promise.all([
    getVisibleTasks({
      assigneeId: mine ? profile.id : undefined,
      projectId: params.project,
      status: params.status,
      taskType: params.type,
    }),
    getProjects(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Tasks</h1>
        <p className="text-sm text-muted-foreground">
          Every task you can see, across projects.
        </p>
      </div>

      <TasksView
        tasks={tasks}
        projects={projects}
        mine={mine}
        filters={params}
        currentUserId={profile.id}
        isExec={isExec(profile.role)}
        canViewAll={canViewAll}
      />
    </div>
  );
}
