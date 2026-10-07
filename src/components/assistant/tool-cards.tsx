import type { ReactNode } from "react";
import { HealthBadge } from "@/components/health-badge";
import { Badge } from "@/components/ui/badge";
import { attendanceTone, barPercent, deadlineLabel, humanize, type Tone } from "@/lib/assistant/card-format";
import { formatDateParts, getOrgTodayDateString } from "@/lib/date";
import { TASK_PRIORITY_DOT_CLASS, TASK_STATUS_BADGE_CLASS, TASK_STATUS_LABELS } from "@/lib/project-labels";
import type { ProjectHealth, TaskPriority, TaskStatus } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";

type Result<T> = { items?: T[]; total?: number; truncated?: boolean; note?: string };

const TONE_BAR: Record<Tone, string> = { good: "bg-primary", warn: "bg-amber-500", bad: "bg-destructive" };
const TONE_TEXT: Record<Tone, string> = { good: "text-primary", warn: "text-amber-600 dark:text-amber-400", bad: "text-destructive" };

function Shell({
  title,
  result,
  children,
}: {
  title: string;
  result: Result<unknown>;
  children: ReactNode;
}) {
  const count = result.items?.length ?? 0;
  return (
    <div className="w-full max-w-xl rounded-lg border bg-card p-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <p className="text-sm font-semibold">{title}</p>
        {count > 0 && <p className="text-xs text-muted-foreground">{result.truncated ? `${count} of ${result.total}` : count}</p>}
      </div>
      {count === 0 ? <p className="py-2 text-sm text-muted-foreground">{result.note ?? "Nothing to show."}</p> : <div className="divide-y">{children}</div>}
    </div>
  );
}

function Bar({ percent, tone }: { percent: number; tone: Tone }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted" role="presentation">
      <div className={cn("h-full rounded-full", TONE_BAR[tone])} style={{ width: `${percent}%` }} />
    </div>
  );
}

function DueText({ due, today }: { due: string | null; today: string }) {
  if (!due) return null;
  const d = deadlineLabel(due, today);
  return <span className={cn("text-xs", d.overdue ? "font-medium text-destructive" : "text-muted-foreground")}>{d.text}</span>;
}

type Task = { task: string; project: string | null; due: string | null; status: string; priority: string };
function TasksCard({ r }: { r: Result<Task> }) {
  const today = getOrgTodayDateString();
  return (
    <Shell title="Open tasks" result={r}>
      {r.items?.map((t, i) => (
        <div key={i} className="flex items-center gap-3 py-2">
          <span className={cn("size-2 shrink-0 rounded-full", TASK_PRIORITY_DOT_CLASS[t.priority as TaskPriority] ?? "bg-muted")} title={`${t.priority} priority`} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{t.task}</p>
            {t.project && <p className="truncate text-xs text-muted-foreground">{t.project}</p>}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <Badge variant="outline" className={TASK_STATUS_BADGE_CLASS[t.status as TaskStatus]}>
              {TASK_STATUS_LABELS[t.status as TaskStatus] ?? humanize(t.status)}
            </Badge>
            <DueText due={t.due} today={today} />
          </div>
        </div>
      ))}
    </Shell>
  );
}

type Evt = { date: string; title: string; type: string; time: string | null; location: string | null };
function EventsCard({ r }: { r: Result<Evt> }) {
  return (
    <Shell title="Upcoming events" result={r}>
      {r.items?.map((e, i) => {
        const p = formatDateParts(e.date);
        return (
          <div key={i} className="flex items-center gap-3 py-2">
            <div className="flex w-11 shrink-0 flex-col items-center rounded-md bg-muted py-1 leading-none">
              <span className="text-[10px] font-medium uppercase text-muted-foreground">{p.month}</span>
              <span className="text-lg font-semibold tabular-nums">{p.day}</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{e.title}</p>
              <p className="truncate text-xs text-muted-foreground">
                {[p.weekday, e.time, e.location].filter(Boolean).join(" · ")}
              </p>
            </div>
            <Badge variant="outline">{humanize(e.type)}</Badge>
          </div>
        );
      })}
    </Shell>
  );
}

type Proj = { client: string; status: string; health: string; deadline: string | null; pm?: string | null; sc?: string | null };
function ProjectsCard({ r, title }: { r: Result<Proj>; title: string }) {
  const today = getOrgTodayDateString();
  return (
    <Shell title={title} result={r}>
      {r.items?.map((p, i) => (
        <div key={i} className="flex items-center gap-3 py-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{p.client}</p>
            <p className="truncate text-xs text-muted-foreground">
              {[humanize(p.status), p.pm && `PM ${p.pm}`, p.sc && `SC ${p.sc}`].filter(Boolean).join(" · ")}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <HealthBadge health={p.health as ProjectHealth} />
            <DueText due={p.deadline} today={today} />
          </div>
        </div>
      ))}
    </Shell>
  );
}

type Att = { name: string; team: string | null; ratePct: number; unexcused: number; tardy: number; excused: number };
function counts(a: { unexcused: number; tardy: number; excused: number }) {
  return [a.unexcused && `${a.unexcused} unexcused`, a.tardy && `${a.tardy} tardy`, a.excused && `${a.excused} excused`]
    .filter(Boolean)
    .join(" · ");
}
function AttendanceReportCard({ r }: { r: Result<Att> }) {
  return (
    <Shell title="Attendance, lowest first" result={r}>
      {r.items?.map((a, i) => {
        const tone = attendanceTone(a.ratePct);
        return (
          <div key={i} className="space-y-1.5 py-2">
            <div className="flex items-baseline justify-between gap-2">
              <p className="truncate text-sm font-medium">
                {a.name} {a.team && <span className="font-normal text-muted-foreground">· {a.team}</span>}
              </p>
              <p className={cn("text-sm font-semibold tabular-nums", TONE_TEXT[tone])}>{a.ratePct}%</p>
            </div>
            <Bar percent={barPercent(a.ratePct, 100)} tone={tone} />
            {counts(a) && <p className="text-xs text-muted-foreground">{counts(a)}</p>}
          </div>
        );
      })}
    </Shell>
  );
}

type MyAtt = { ratePct: number | null; unexcused: number; tardy: number; excused: number; note?: string };
function MyAttendanceCard({ r }: { r: MyAtt }) {
  return (
    <div className="w-full max-w-xl rounded-lg border bg-card p-3">
      <p className="mb-2 text-sm font-semibold">Your attendance</p>
      {r.ratePct === null ? (
        <p className="py-2 text-sm text-muted-foreground">{r.note ?? "No sessions logged yet."}</p>
      ) : (
        <div className="space-y-2">
          <p className={cn("text-3xl font-semibold tabular-nums", TONE_TEXT[attendanceTone(r.ratePct)])}>{r.ratePct}%</p>
          <Bar percent={barPercent(r.ratePct, 100)} tone={attendanceTone(r.ratePct)} />
          <p className="text-xs text-muted-foreground">{counts(r) || "No absences or late arrivals"}</p>
        </div>
      )}
    </div>
  );
}

type Applicant = { name: string; total: number };
function ApplicantsCard({ r }: { r: Result<Applicant> }) {
  const max = Math.max(1, ...(r.items ?? []).map((a) => a.total));
  return (
    <Shell title="Top applicants" result={r}>
      {r.items?.map((a, i) => (
        <div key={i} className="flex items-center gap-3 py-2">
          <span className="w-5 shrink-0 text-center text-sm font-semibold tabular-nums text-muted-foreground">{i + 1}</span>
          <div className="min-w-0 flex-1 space-y-1">
            <p className="truncate text-sm font-medium">{a.name}</p>
            <Bar percent={barPercent(a.total, max)} tone="good" />
          </div>
          <span className="w-10 shrink-0 text-right text-sm font-semibold tabular-nums">{a.total}</span>
        </div>
      ))}
    </Shell>
  );
}

type Person = { name: string; role: string; team: string | null };
function DirectoryCard({ r }: { r: Result<Person> }) {
  return (
    <Shell title="People" result={r}>
      {r.items?.map((p, i) => (
        <div key={i} className="flex items-center gap-3 py-2">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
            {p.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{p.name}</p>
            {p.team && <p className="truncate text-xs text-muted-foreground">{p.team}</p>}
          </div>
          <Badge variant="outline">{p.role}</Badge>
        </div>
      ))}
    </Shell>
  );
}

/** Draws a read tool's structured result. Returns null for tools without a card (e.g. write proposals). */
export function ToolCard({ toolName, output }: { toolName: string; output: unknown }): ReactNode {
  switch (toolName) {
    case "my_open_tasks":
      return <TasksCard r={output as Result<Task>} />;
    case "upcoming_events":
      return <EventsCard r={output as Result<Evt>} />;
    case "my_projects":
      return <ProjectsCard r={output as Result<Proj>} title="Your projects" />;
    case "quarter_projects":
      return <ProjectsCard r={output as Result<Proj>} title="Projects this quarter" />;
    case "attendance_report":
      return <AttendanceReportCard r={output as Result<Att>} />;
    case "my_attendance":
      return <MyAttendanceCard r={output as MyAtt} />;
    case "top_applicants":
      return <ApplicantsCard r={output as Result<Applicant>} />;
    case "directory":
      return <DirectoryCard r={output as Result<Person>} />;
    default:
      return null;
  }
}
