"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Plus, Pencil, Trash2, MapPin, Clock } from "lucide-react";
import { deleteOrgEvent, deleteProjectEvent } from "@/actions/calendar";
import type { CalendarEvent, LeadProject } from "@/lib/data/calendar";
import { parseLocalDate } from "@/lib/date";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { EventFormDialog, type EventFormValues } from "./event-form-dialog";
import { ProjectEventFormDialog, type ProjectEventFormValues } from "./project-event-form-dialog";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const TYPE_STYLE: Record<CalendarEvent["type"], { dot: string; chip: string }> = {
  meeting: { dot: "bg-link", chip: "bg-primary text-primary-foreground" },
  deadline: { dot: "bg-status-bad-foreground", chip: "bg-status-bad text-status-bad-foreground" },
  event: { dot: "bg-status-warn-foreground", chip: "bg-status-warn text-status-warn-foreground" },
  project: { dot: "bg-status-info-foreground", chip: "bg-status-info text-status-info-foreground" },
};

const TYPE_LABEL: Record<CalendarEvent["type"], string> = {
  meeting: "Meeting day",
  deadline: "Project deadline",
  event: "Event",
  project: "Project item",
};

const TYPE_ORDER: Record<CalendarEvent["type"], number> = {
  meeting: 0,
  deadline: 1,
  event: 2,
  project: 3,
};

function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const EMPTY_FORM: EventFormValues = {
  id: null,
  title: "",
  date: "",
  time: "",
  location: "",
  description: "",
};

function emptyProjectForm(projectId: string, date: string): ProjectEventFormValues {
  return { id: null, projectId, consultantId: null, title: "", date, time: "", location: "", description: "" };
}

export function CalendarView({
  events,
  today,
  isExec,
  leadProjects,
}: {
  events: CalendarEvent[];
  today: string;
  isExec: boolean;
  leadProjects: LeadProject[];
}) {
  const router = useRouter();
  const [viewMonth, setViewMonth] = useState(() => {
    const d = parseLocalDate(today);
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [form, setForm] = useState<EventFormValues | null>(null);
  const [projectForm, setProjectForm] = useState<ProjectEventFormValues | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    title: string;
    type: CalendarEvent["type"];
    projectId: string | null;
  } | null>(null);
  const [isDeleting, startDelete] = useTransition();
  const canAddProjectItem = leadProjects.length > 0;

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of events) {
      const list = map.get(e.date) ?? [];
      list.push(e);
      map.set(e.date, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => TYPE_ORDER[a.type] - TYPE_ORDER[b.type] || a.title.localeCompare(b.title));
    }
    return map;
  }, [events]);

  const weeks = useMemo(() => {
    const start = new Date(viewMonth);
    start.setDate(start.getDate() - start.getDay());
    const days: Date[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      days.push(d);
    }
    const result: Date[][] = [];
    for (let i = 0; i < 42; i += 7) result.push(days.slice(i, i + 7));
    return result;
  }, [viewMonth]);

  function openAddDialog(dateStr: string) {
    setOpenDay(null);
    setForm({ ...EMPTY_FORM, date: dateStr });
  }

  function openAddProjectDialog(dateStr: string) {
    setOpenDay(null);
    setProjectForm(emptyProjectForm(leadProjects[0]?.id ?? "", dateStr));
  }

  function openEditDialog(e: CalendarEvent) {
    setOpenDay(null);
    if (e.type === "project") {
      setProjectForm({
        id: e.sourceId,
        projectId: e.projectId!,
        consultantId: e.consultantId,
        title: e.title,
        date: e.date,
        time: e.time ?? "",
        location: e.location ?? "",
        description: e.description ?? "",
      });
      return;
    }
    setForm({
      id: e.sourceId,
      title: e.title,
      date: e.date,
      time: e.time ?? "",
      location: e.location ?? "",
      description: e.description ?? "",
    });
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    startDelete(async () => {
      const result =
        target.type === "project"
          ? await deleteProjectEvent(target.id, target.projectId!)
          : await deleteOrgEvent(target.id);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Deleted.");
      setDeleteTarget(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
            aria-label="Previous month"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
            aria-label="Next month"
          >
            <ChevronRight className="size-4" />
          </Button>
          <h2 className="ml-2 min-w-40 text-lg font-semibold">
            {viewMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
          </h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              const d = parseLocalDate(today);
              setViewMonth(new Date(d.getFullYear(), d.getMonth(), 1));
            }}
          >
            Today
          </Button>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {(Object.keys(TYPE_LABEL) as CalendarEvent["type"][]).map((type) => (
              <span key={type} className="flex items-center gap-1.5">
                <span className={cn("size-2 rounded-full", TYPE_STYLE[type].dot)} />
                {TYPE_LABEL[type]}
              </span>
            ))}
          </div>
          {isExec && (
            <Button size="sm" onClick={() => openAddDialog(today)} className="gap-1.5">
              <Plus className="size-4" />
              Add event
            </Button>
          )}
          {canAddProjectItem && (
            <Button size="sm" variant="outline" onClick={() => openAddProjectDialog(today)} className="gap-1.5">
              <Plus className="size-4" />
              Add my item
            </Button>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border">
        <div className="grid grid-cols-7 border-b bg-muted/40">
          {WEEKDAYS.map((w) => (
            <div key={w} className="px-2 py-1.5 text-center text-xs font-medium text-muted-foreground">
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {weeks.flatMap((week) =>
            week.map((d) => {
              const dateStr = toDateString(d);
              const inMonth = d.getMonth() === viewMonth.getMonth();
              const isToday = dateStr === today;
              const dayEvents = eventsByDate.get(dateStr) ?? [];
              const visible = dayEvents.slice(0, 3);
              const overflow = dayEvents.length - visible.length;

              return (
                <Popover
                  key={dateStr}
                  open={openDay === dateStr}
                  onOpenChange={(next) => setOpenDay(next ? dateStr : null)}
                >
                  <PopoverTrigger
                    render={
                      <button
                        type="button"
                        className={cn(
                          "flex min-h-24 flex-col gap-1 border-b border-r p-1.5 text-left align-top last:border-r-0 hover:bg-muted/40 [&:nth-child(7n)]:border-r-0",
                          !inMonth && "bg-muted/20 text-muted-foreground",
                        )}
                      />
                    }
                  >
                    <span
                      className={cn(
                        "flex size-5 items-center justify-center rounded-full text-xs",
                        isToday && "bg-primary font-semibold text-primary-foreground",
                      )}
                    >
                      {d.getDate()}
                    </span>
                    <div className="flex flex-col gap-0.5">
                      {visible.map((e) => (
                        <span
                          key={e.id}
                          className={cn(
                            "truncate rounded px-1 py-0.5 text-left text-xs leading-tight",
                            TYPE_STYLE[e.type].chip,
                          )}
                        >
                          {e.title}
                        </span>
                      ))}
                      {overflow > 0 && (
                        <span className="px-1 text-xs text-muted-foreground">+{overflow} more</span>
                      )}
                    </div>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-80">
                    <div className="flex items-center justify-between">
                      <p className="font-medium">
                        {d.toLocaleDateString("en-US", {
                          weekday: "long",
                          month: "long",
                          day: "numeric",
                        })}
                      </p>
                      <div className="flex gap-1">
                        {isExec && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 gap-1 px-2 text-xs"
                            onClick={() => openAddDialog(dateStr)}
                          >
                            <Plus className="size-3.5" />
                            Event
                          </Button>
                        )}
                        {canAddProjectItem && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 gap-1 px-2 text-xs"
                            onClick={() => openAddProjectDialog(dateStr)}
                          >
                            <Plus className="size-3.5" />
                            My item
                          </Button>
                        )}
                      </div>
                    </div>
                    {dayEvents.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Nothing scheduled.</p>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {dayEvents.map((e) => (
                          <div key={e.id} className="rounded-md border p-2 text-sm">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <span
                                  className={cn(
                                    "mb-1 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium uppercase tracking-wide",
                                    TYPE_STYLE[e.type].chip,
                                  )}
                                >
                                  <span className={cn("size-1.5 rounded-full", TYPE_STYLE[e.type].dot)} />
                                  {TYPE_LABEL[e.type]}
                                </span>
                                {e.href ? (
                                  <Link href={e.href} className="block font-medium hover:underline">
                                    {e.title}
                                  </Link>
                                ) : (
                                  <p className="font-medium">{e.title}</p>
                                )}
                                {e.subtitle && (
                                  <p className="text-xs text-muted-foreground">{e.subtitle}</p>
                                )}
                                {(e.time || e.location) && (
                                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                                    {e.time && (
                                      <span className="flex items-center gap-1">
                                        <Clock className="size-3" />
                                        {e.time}
                                      </span>
                                    )}
                                    {e.location && (
                                      <span className="flex items-center gap-1">
                                        <MapPin className="size-3" />
                                        {e.location}
                                      </span>
                                    )}
                                  </div>
                                )}
                                {e.description && (
                                  <p className="mt-1 text-xs text-muted-foreground">{e.description}</p>
                                )}
                              </div>
                              {e.canManage && (e.type === "event" || e.type === "project") && (
                                <div className="flex shrink-0 gap-0.5">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="size-6"
                                    onClick={() => openEditDialog(e)}
                                    aria-label="Edit"
                                  >
                                    <Pencil className="size-3.5" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="size-6 text-destructive hover:text-destructive"
                                    onClick={() => {
                                      setOpenDay(null);
                                      setDeleteTarget({
                                        id: e.sourceId,
                                        title: e.title,
                                        type: e.type,
                                        projectId: e.projectId,
                                      });
                                    }}
                                    aria-label="Delete"
                                  >
                                    <Trash2 className="size-3.5" />
                                  </Button>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </PopoverContent>
                </Popover>
              );
            }),
          )}
        </div>
      </div>

      {form && <EventFormDialog defaults={form} onClose={() => setForm(null)} />}
      {projectForm && (
        <ProjectEventFormDialog
          defaults={projectForm}
          leadProjects={leadProjects}
          onClose={() => setProjectForm(null)}
        />
      )}

      <AlertDialog open={deleteTarget !== null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &quot;{deleteTarget?.title}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>This can&apos;t be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} disabled={isDeleting}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
