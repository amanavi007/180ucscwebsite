"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  TASK_TYPES,
  taskTypeLabel,
} from "@/lib/project-labels";
import { parseLocalDate } from "@/lib/date";
import type { ProjectWithRelations } from "@/lib/data/types";
import type { TaskWithProject } from "@/lib/data/types";

const ALL = "__all__";

interface Filters {
  project?: string;
  status?: string;
  type?: string;
}

export function TasksView({
  tasks,
  projects,
  mine,
  filters,
}: {
  tasks: TaskWithProject[];
  projects: ProjectWithRelations[];
  mine: boolean;
  filters: Filters;
}) {
  const router = useRouter();

  function setParam(key: string, value: string | null) {
    const url = new URL(window.location.href);
    if (!value || value === ALL) {
      url.searchParams.delete(key);
    } else {
      url.searchParams.set(key, value);
    }
    router.push(`${url.pathname}${url.search}`);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex overflow-hidden rounded-md border">
          <Button
            variant={mine ? "default" : "ghost"}
            size="sm"
            className="rounded-none"
            onClick={() => setParam("mine", "1")}
          >
            My tasks
          </Button>
          <Button
            variant={!mine ? "default" : "ghost"}
            size="sm"
            className="rounded-none"
            onClick={() => setParam("mine", "0")}
          >
            All tasks
          </Button>
        </div>

        <Select value={filters.project ?? ALL} onValueChange={(v) => setParam("project", v)}>
          <SelectTrigger size="sm" className="w-44">
            <SelectValue placeholder="All projects">
              {(value: string) =>
                value === ALL
                  ? "All projects"
                  : (projects.find((p) => p.id === value)?.client_name ?? "All projects")
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All projects</SelectItem>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.client_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filters.status ?? ALL} onValueChange={(v) => setParam("status", v)}>
          <SelectTrigger size="sm" className="w-36">
            <SelectValue placeholder="All statuses">
              {(value: string) =>
                value === ALL
                  ? "All statuses"
                  : TASK_STATUS_LABELS[value as keyof typeof TASK_STATUS_LABELS]
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            {Object.entries(TASK_STATUS_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filters.type ?? ALL} onValueChange={(v) => setParam("type", v)}>
          <SelectTrigger size="sm" className="w-44">
            <SelectValue placeholder="All phases">
              {(value: string) =>
                value === ALL ? "All phases" : taskTypeLabel(value as (typeof TASK_TYPES)[number])
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All phases</SelectItem>
            {TASK_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {taskTypeLabel(t)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Task</TableHead>
            <TableHead>Project</TableHead>
            <TableHead>Phase</TableHead>
            <TableHead>Assignee</TableHead>
            <TableHead>Due</TableHead>
            <TableHead>Priority</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tasks.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-muted-foreground">
                No tasks match these filters.
              </TableCell>
            </TableRow>
          )}
          {tasks.map((task) => (
            <TableRow key={task.id}>
              <TableCell className={task.is_milestone ? "font-medium" : ""}>
                {task.task_name}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {task.project && (
                  <Link href={`/projects/${task.project.id}`} className="hover:underline">
                    {task.project.client_name}
                  </Link>
                )}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {taskTypeLabel(task.task_type)}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {task.assignee?.name ?? "Unassigned"}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {task.due_date ? format(parseLocalDate(task.due_date), "MMM d, yyyy") : "—"}
              </TableCell>
              <TableCell>
                <Badge variant="secondary">{TASK_PRIORITY_LABELS[task.priority]}</Badge>
              </TableCell>
              <TableCell>
                <Badge variant="secondary">{TASK_STATUS_LABELS[task.status]}</Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
