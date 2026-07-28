import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TaskRow } from "./task-row";
import { AddSubtaskDialog } from "./add-subtask-dialog";
import type { TaskWithAssignee } from "@/lib/data/types";

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
  const milestones = tasks.filter((t) => t.parent_task_id === null);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Tasks</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {milestones.map((milestone) => {
          const children = tasks.filter((t) => t.parent_task_id === milestone.id);
          return (
            <div key={milestone.id}>
              <TaskRow
                task={milestone}
                projectId={projectId}
                canEdit={canManage}
                canDelete={false}
                rosterProfiles={rosterProfiles}
                currentUserId={currentUserId}
              />
              <div>
                {children.map((child) => (
                  <TaskRow
                    key={child.id}
                    task={child}
                    projectId={projectId}
                    canEdit={canManage}
                    canDelete={canManage}
                    rosterProfiles={rosterProfiles}
                    currentUserId={currentUserId}
                    indented
                  />
                ))}
              </div>
              {canManage && (
                <AddSubtaskDialog
                  projectId={projectId}
                  parentTaskId={milestone.id}
                  milestoneName={milestone.task_name}
                  rosterProfiles={rosterProfiles}
                />
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
