import type { Metadata } from "next";
import { getCurrentProfile } from "@/lib/data/profile";
import { getVisibleTasks } from "@/lib/data/tasks";
import { getProjects } from "@/lib/data/projects";
import { getQuarters, getActiveQuarter } from "@/lib/data/quarters";
import { isExec, isElevatedOrAbove } from "@/lib/auth/roles";
import { QuarterSelect } from "@/components/quarter-select";
import { TasksView } from "./tasks-view";

export const metadata: Metadata = { title: "Tasks" };

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{
    quarter?: string;
    mine?: string;
    project?: string;
    status?: string;
    type?: string;
  }>;
}) {
  const params = await searchParams;
  const [profile, quarters, activeQuarter] = await Promise.all([
    getCurrentProfile(),
    getQuarters(),
    getActiveQuarter(),
  ]);
  const canViewAll = isElevatedOrAbove(profile.role);

  const selectedQuarterId = params.quarter || activeQuarter?.id;

  // Base-tier consultants only ever see their own tasks -- ignore the "mine" param for them.
  const mine = canViewAll ? params.mine !== "0" : true;

  const [tasks, projects] = await Promise.all([
    selectedQuarterId
      ? getVisibleTasks({
          assigneeId: mine ? profile.id : undefined,
          projectId: params.project,
          status: params.status,
          taskType: params.type,
          quarterId: selectedQuarterId,
        })
      : Promise.resolve([]),
    selectedQuarterId ? getProjects(selectedQuarterId) : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl leading-tight">Tasks</h1>
          <p className="text-sm text-muted-foreground">
            Every task you can see, across projects.
          </p>
        </div>
        {quarters.length > 0 && (
          <QuarterSelect
            quarters={quarters}
            selectedId={selectedQuarterId ?? ""}
            basePath="/portal/tasks"
          />
        )}
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
