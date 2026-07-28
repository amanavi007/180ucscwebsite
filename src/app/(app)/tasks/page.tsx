import { getCurrentProfile } from "@/lib/data/profile";
import { getVisibleTasks } from "@/lib/data/tasks";
import { getProjects } from "@/lib/data/projects";
import { TasksView } from "./tasks-view";

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

  const mine = params.mine !== "0";

  const tasks = await getVisibleTasks({
    assigneeId: mine ? profile.id : undefined,
    projectId: params.project,
    status: params.status,
    taskType: params.type,
  });

  const projects = await getProjects();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Tasks</h1>
        <p className="text-sm text-muted-foreground">
          Every task you can see, across projects.
        </p>
      </div>

      <TasksView tasks={tasks} projects={projects} mine={mine} filters={params} />
    </div>
  );
}
