import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { HealthBadge } from "@/components/health-badge";
import { Badge } from "@/components/ui/badge";
import { attendanceTone, barPercent, deadlineLabel, humanize, type Tone } from "@/lib/assistant/card-format";
import { formatDateParts, getOrgTodayDateString } from "@/lib/date";
import { TASK_PRIORITY_DOT_CLASS, TASK_STATUS_BADGE_CLASS, TASK_STATUS_LABELS } from "@/lib/project-labels";
import type { ProjectHealth, TaskPriority, TaskStatus } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";

type Result<T> = { items?: T[]; total?: number; truncated?: boolean; note?: string };

const TONE_BAR: Record<Tone, string> = { good: "bg-foreground", warn: "bg-warning", bad: "bg-destructive" };
const TONE_TEXT: Record<Tone, string> = { good: "text-link", warn: "text-status-warn-foreground", bad: "text-destructive" };

/** Tool results start collapsed: the reply text carries the answer, the card is the detail behind a small arrow. */
function Collapsible({ title, meta, children }: { title: string; meta?: ReactNode; children: ReactNode }) {
  return (
    <details className="group w-full max-w-xl rounded-lg border bg-card text-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-1.5">
          <ChevronRight className="size-3.5 shrink-0 transition-transform group-open:rotate-90" aria-hidden />
          <span className="text-xs font-medium">{title}</span>
        </span>
        {meta !== undefined && <span className="text-xs">{meta}</span>}
      </summary>
      <div className="border-t px-3 pb-2">{children}</div>
    </details>
  );
}

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
  if (count === 0) {
    return <div className="w-full max-w-xl rounded-lg border bg-card px-3 py-2 text-xs text-muted-foreground">{result.note ?? "Nothing to show."}</div>;
  }
  return (
    <Collapsible title={title} meta={result.truncated ? `${count} of ${result.total}` : count}>
      <div className="divide-y">{children}</div>
    </Collapsible>
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

type Task = { task: string; project: string | null; assignee?: string | null; due: string | null; status: string; priority: string };
function TasksCard({ r, title = "Open tasks" }: { r: Result<Task>; title?: string }) {
  const today = getOrgTodayDateString();
  return (
    <Shell title={title} result={r}>
      {r.items?.map((t, i) => (
        <div key={i} className="flex items-center gap-3 py-2">
          <span className={cn("size-2 shrink-0 rounded-full", TASK_PRIORITY_DOT_CLASS[t.priority as TaskPriority] ?? "bg-muted")} title={`${t.priority} priority`} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{t.task}</p>
            {(t.project || t.assignee) && (
              <p className="truncate text-xs text-muted-foreground">{[t.project, t.assignee].filter(Boolean).join(" · ")}</p>
            )}
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

type Row = { primary: string; secondary?: string | null; badge?: string | null; href?: string | null };
function ListCard({ r, title, row }: { r: Result<Record<string, unknown>>; title: string; row: (i: Record<string, unknown>) => Row }) {
  return (
    <Shell title={title} result={r}>
      {r.items?.map((item, i) => {
        const x = row(item);
        const body = (
          <>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{x.primary}</p>
              {x.secondary && <p className="truncate text-xs text-muted-foreground">{x.secondary}</p>}
            </div>
            {x.badge && <Badge variant="outline">{x.badge}</Badge>}
          </>
        );
        return x.href ? (
          x.href.startsWith("/") ? (
            <Link key={i} href={x.href} className="flex items-center gap-3 py-2 hover:bg-muted/50">{body}</Link>
          ) : (
            <a key={i} href={x.href} target="_blank" rel="noreferrer noopener" className="flex items-center gap-3 py-2 hover:bg-muted/50">{body}</a>
          )
        ) : (
          <div key={i} className="flex items-center gap-3 py-2">{body}</div>
        );
      })}
    </Shell>
  );
}

const str = (v: unknown) => (v === null || v === undefined ? null : String(v));
const safeHref = (v: unknown) => (typeof v === "string" && /^\/portal(\/|$|\?)/.test(v) ? v : null);

type ProjectDetail = {
  client?: string; status?: string; health?: string; deadline?: string | null; pm?: string | null; sc?: string | null;
  team?: string; tasksDone?: number; tasksOpen?: number; tasksOverdue?: number; nextTasks?: string; href?: string; note?: string;
};
function ProjectDetailCard({ r }: { r: ProjectDetail }) {
  const today = getOrgTodayDateString();
  if (!r.client) {
    return <div className="w-full max-w-xl rounded-lg border bg-card p-3 text-sm text-muted-foreground">{r.note ?? "Project not found."}</div>;
  }
  const href = safeHref(r.href);
  return (
    <div className="w-full max-w-xl space-y-2 rounded-lg border bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {href ? <Link href={href} className="truncate text-sm font-semibold hover:underline">{r.client}</Link> : <p className="truncate text-sm font-semibold">{r.client}</p>}
          <p className="text-xs text-muted-foreground">{humanize(r.status ?? "")}{r.deadline ? ` · due ` : ""}{r.deadline && <DueText due={r.deadline} today={today} />}</p>
        </div>
        {r.health && <HealthBadge health={r.health as ProjectHealth} />}
      </div>
      <p className="text-xs text-muted-foreground">PM {r.pm ?? "-"} · SC {r.sc ?? "-"}</p>
      <p className="text-xs"><span className="font-medium">{r.tasksOpen ?? 0}</span> open · <span className="font-medium">{r.tasksDone ?? 0}</span> done{(r.tasksOverdue ?? 0) > 0 && <span className="font-medium text-destructive"> · {r.tasksOverdue} overdue</span>}</p>
      {r.team && <p className="text-xs text-muted-foreground">Team: {r.team}</p>}
    </div>
  );
}

function NoteCard({ r, title }: { r: Record<string, unknown>; title: string }) {
  if (typeof r.note === "string") {
    return <div className="w-full max-w-xl rounded-lg border bg-card p-3 text-sm text-muted-foreground">{r.note}</div>;
  }
  const { name, ...rest } = r;
  return (
    <div className="w-full max-w-xl space-y-1 rounded-lg border bg-card p-3">
      <p className="text-sm font-semibold">{String(name ?? title)}</p>
      {Object.entries(rest)
        .filter(([, v]) => v !== null && v !== undefined && v !== "")
        .map(([k, v]) => (
          <p key={k} className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{humanize(k)}:</span> {String(v)}
          </p>
        ))}
    </div>
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
    case "tasks":
      return <TasksCard r={output as Result<Task>} title="Tasks" />;
    case "project_detail":
      return <ProjectDetailCard r={output as ProjectDetail} />;
    case "resources":
      return (output as { content?: string }).content !== undefined ? (
        <Collapsible title={str((output as { title?: string }).title) ?? "Resources page"}>
          <p className="mt-2 whitespace-pre-line text-xs text-muted-foreground">{str((output as { content?: string }).content)}</p>
        </Collapsible>
      ) : (
        <ListCard r={output as Result<Record<string, unknown>>} title="From Resources" row={(i) => ({ primary: String(i.title), secondary: str(i.excerpt)?.slice(0, 140) ?? null, badge: str(i.section), href: safeHref(i.href) })} />
      );
    case "knowledge":
      return <ListCard r={output as Result<Record<string, unknown>>} title="From the knowledge base" row={(i) => ({ primary: String(i.title), secondary: str(i.excerpt)?.slice(0, 140) ?? null, badge: str(i.section)?.slice(0, 28) ?? null })} />;
    case "quick_links":
      return <ListCard r={output as Result<Record<string, unknown>>} title="Quick links" row={(i) => ({ primary: String(i.title), secondary: str(i.description) ?? str(i.url), badge: str(i.category), href: /^https?:\/\//i.test(String(i.url)) ? String(i.url) : null })} />;
    case "notifications":
      return <ListCard r={output as Result<Record<string, unknown>>} title="Notifications" row={(i) => ({ primary: String(i.message), badge: str(i.when), href: safeHref(i.href) })} />;
    case "search":
      return <ListCard r={output as Result<Record<string, unknown>>} title="Search results" row={(i) => ({ primary: String(i.title), secondary: str(i.subtitle), badge: str(i.type), href: safeHref(i.href) })} />;
    case "member_stats":
      return <ListCard r={output as Result<Record<string, unknown>>} title="Member stats" row={(i) => ({ primary: String(i.name), secondary: `${i.team ?? "No team"} · ${i.done}/${i.total} tasks done${Number(i.overdue) > 0 ? ` · ${i.overdue} overdue` : ""}`, badge: i.attendancePct === null ? "-" : `${i.attendancePct}%` })} />;
    case "activity_log":
      return <ListCard r={output as Result<Record<string, unknown>>} title="Recent activity" row={(i) => ({ primary: `${i.who}: ${String(i.action).replace(/[._]/g, " ")}`, secondary: [i.target, i.detail].filter(Boolean).join(" · "), badge: str(i.when) })} />;
    case "needs_attention":
      return <ListCard r={output as Result<Record<string, unknown>>} title="Needs attention" row={(i) => ({ primary: String(i.label), href: safeHref(i.href) })} />;
    case "my_next_steps":
      return <ListCard r={output as Result<Record<string, unknown>>} title="Your next steps" row={(i) => ({ primary: String(i.project), secondary: `${i.stage} · next: ${i.nextTasks}`, badge: Number(i.overdue) > 0 ? `${i.overdue} overdue` : str(i.health), href: safeHref(i.guideHref) })} />;
    case "meeting_dates":
      return <ListCard r={output as Result<Record<string, unknown>>} title="Meeting days" row={(i) => ({ primary: (() => { const d = formatDateParts(String(i.date)); return `${d.weekday}, ${d.month} ${d.day}`; })() })} />;
    case "applicant_detail":
      return <NoteCard r={output as Record<string, unknown>} title="Applicant" />;
    case "person_detail":
      return <NoteCard r={output as Record<string, unknown>} title="Person" />;
    case "recruit_setup":
      return <ListCard r={output as Result<Record<string, unknown>>} title="Recruitment setup" row={(i) => ({ primary: String(i.name), secondary: str(i.detail), badge: str(i.kind) })} />;
    case "quarters":
      return <ListCard r={output as Result<Record<string, unknown>>} title="Quarters" row={(i) => ({ primary: String(i.name), secondary: `${i.start} → ${i.end}`, badge: i.active ? "active" : null })} />;
    case "clients":
      return <ListCard r={output as Result<Record<string, unknown>>} title="Clients" row={(i) => ({ primary: String(i.client), secondary: `${i.projects} projects${i.lastQuarter ? ` · last ${i.lastQuarter}` : ""}`, badge: i.current ? "current" : null })} />;
    case "alumni":
      return <ListCard r={output as Result<Record<string, unknown>>} title="Alumni" row={(i) => ({ primary: String(i.name), secondary: [i.title, i.company].filter(Boolean).join(" at ") || str(i.projects) })} />;
    case "scheduling":
      return <ListCard r={output as Result<Record<string, unknown>>} title="Upcoming bookings" row={(i) => ({ primary: `${i.who}`, secondary: `${i.when}${i.execs ? ` · ${i.execs}` : ""}`, badge: str(i.type) })} />;
    case "team_plans":
      return <ListCard r={output as Result<Record<string, unknown>>} title="Team plans" row={(i) => ({ primary: String(i.plan), badge: str(i.status) })} />;
    case "project_attendance":
      return <ListCard r={output as Result<Record<string, unknown>>} title="Attendance sessions" row={(i) => ({ primary: String(i.date), secondary: `${i.unexcused} unexcused · ${i.tardy} tardy · ${i.excused} excused`, badge: str(i.takenBy) })} />;
    case "team_attendance_status":
      return <ListCard r={output as Result<Record<string, unknown>>} title="Teams behind on attendance" row={(i) => ({ primary: String(i.team), secondary: str(i.missingDates) ? `Missing: ${i.missingDates}` : "Not logged today" })} />;
    default:
      return null;
  }
}
