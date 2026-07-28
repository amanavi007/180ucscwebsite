import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { TaskRow } from "./task-row";
import { AddTaskDialog } from "./add-task-dialog";
import type { TaskWithAssignee } from "@/lib/data/types";

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const COLUMN_HEADERS = ["Task", "Priority", "Assignee", "Due", "Status", ""];

export function TaskList({
  projectId,
  tasks,
  canManage,
  currentUserId,
  rosterProfiles,
}: {
  projectId: string;
  tasks: TaskWithAssignee[];
  canManage: boolean;
  currentUserId: string;
  rosterProfiles: { id: string; name: string }[];
}) {
  const byAssignee = new Map<string, TaskWithAssignee[]>();
  const unassigned: TaskWithAssignee[] = [];
  for (const task of tasks) {
    if (!task.assignee_id) {
      unassigned.push(task);
      continue;
    }
    const list = byAssignee.get(task.assignee_id) ?? [];
    list.push(task);
    byAssignee.set(task.assignee_id, list);
  }

  // Someone with tasks who has since left the roster shouldn't lose their history.
  const knownIds = new Set(rosterProfiles.map((p) => p.id));
  const strayIds = [...byAssignee.keys()].filter((id) => !knownIds.has(id));

  // Base-tier consultants only ever have their own tasks in `tasks` (filtered upstream) --
  // don't show empty placeholder sections for teammates whose tasks are just hidden from view.
  const sections = canManage
    ? [
        ...rosterProfiles.map((p) => ({ id: p.id, name: p.name, tasks: byAssignee.get(p.id) ?? [] })),
        ...strayIds.map((id) => ({
          id,
          name: byAssignee.get(id)?.[0]?.assignee?.name ?? "Former member",
          tasks: byAssignee.get(id)!,
        })),
      ]
    : [
        {
          id: currentUserId,
          name: rosterProfiles.find((p) => p.id === currentUserId)?.name ?? "My tasks",
          tasks: byAssignee.get(currentUserId) ?? [],
        },
      ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Tasks</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="hidden grid-cols-[1fr_7rem_9rem_9rem_13rem_2rem] gap-3 px-3 text-xs font-medium text-muted-foreground sm:grid">
          {COLUMN_HEADERS.map((h, i) => (
            <span key={i}>{h}</span>
          ))}
        </div>

        {sections.map((section) => {
          const isOwn = section.id === currentUserId;
          const doneCount = section.tasks.filter((t) => t.status === "done").length;
          const total = section.tasks.length;
          const progressPct = total > 0 ? Math.round((doneCount / total) * 100) : 0;

          return (
            <div key={section.id}>
              <div className="mb-2 flex items-center gap-2.5">
                <Avatar className="size-6">
                  <AvatarFallback className="text-[10px]">{initials(section.name)}</AvatarFallback>
                </Avatar>
                <h3 className="text-sm font-medium">{section.name}</h3>
                {total > 0 && (
                  <>
                    <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {doneCount}/{total} done
                    </span>
                  </>
                )}
              </div>
              <div className="overflow-hidden rounded-md border">
                {section.tasks.length === 0 && (
                  <p className="px-3 py-4 text-sm text-muted-foreground">No tasks yet.</p>
                )}
                {section.tasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    projectId={projectId}
                    canManage={canManage}
                    isOwn={isOwn}
                    rosterProfiles={rosterProfiles}
                  />
                ))}
              </div>
              {(canManage || isOwn) && (
                <div className="mt-1">
                  <AddTaskDialog
                    projectId={projectId}
                    defaultAssigneeId={section.id}
                    rosterProfiles={rosterProfiles}
                    canAssignOthers={canManage}
                  />
                </div>
              )}
            </div>
          );
        })}

        {unassigned.length > 0 && (
          <div>
            <h3 className="mb-2 text-sm font-medium">Unassigned</h3>
            <div className="overflow-hidden rounded-md border">
              {unassigned.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  projectId={projectId}
                  canManage={canManage}
                  isOwn={false}
                  rosterProfiles={rosterProfiles}
                />
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
