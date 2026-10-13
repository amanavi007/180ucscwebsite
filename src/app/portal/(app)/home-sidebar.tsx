import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getOrgTodayDateString, parseLocalDate } from "@/lib/date";
import { getMeetingDatesForQuarter } from "@/lib/data/meeting-dates";
import { getMeetingTime } from "@/lib/data/meeting-time";
import { formatMeetingTime } from "@/lib/meeting-time";
import { getVisibleTasks } from "@/lib/data/tasks";
import { getMyProjects } from "@/lib/data/projects";

function dueChip(due: string | null, today: string): { label: string; variant: "bad" | "warn" | "muted" } {
  if (!due) return { label: "No date", variant: "muted" };
  if (due < today) return { label: "Late", variant: "bad" };
  if (due === today) return { label: "Due today", variant: "bad" };
  const days = Math.round((parseLocalDate(due).getTime() - parseLocalDate(today).getTime()) / 86_400_000);
  if (days <= 3) return { label: parseLocalDate(due).toLocaleDateString("en-US", { weekday: "short" }), variant: "warn" };
  return { label: parseLocalDate(due).toLocaleDateString("en-US", { month: "short", day: "numeric" }), variant: "muted" };
}

async function safe<T>(promise: Promise<T>, fallback: T): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    console.error("Home sidebar source failed:", error);
    return fallback;
  }
}

/** The "what do I do today" column beside the assistant: next meeting, your open tasks, your projects. */
export async function HomeSidebar({ userId, quarterId }: { userId: string; quarterId: string }) {
  const today = getOrgTodayDateString();
  const [dates, tasks, projects, meetingTime] = await Promise.all([
    safe(getMeetingDatesForQuarter(quarterId), [] as string[]),
    safe(getVisibleTasks({ assigneeId: userId, quarterId }), []),
    safe(getMyProjects(userId, quarterId), []),
    getMeetingTime(),
  ]);
  const timeLabel = formatMeetingTime(meetingTime);

  const nextMeeting = dates.find((d) => d >= today) ?? null;
  const open = tasks.filter((t) => t.status !== "done").slice(0, 5);
  const meeting = nextMeeting ? parseLocalDate(nextMeeting) : null;

  return (
    <aside aria-label="Today" className="flex min-w-0 flex-col gap-5 overflow-y-auto">
      <section className="rounded-[22px] border-[1.5px] border-(--primary-border) bg-primary p-5 text-primary-foreground shadow-[0_4px_0_var(--primary-edge)]">
        <p className="text-xs font-bold tracking-wider uppercase">{nextMeeting === today ? "Today" : "Next meeting"}</p>
        {meeting ? (
          <>
            <h2 className="mt-1.5 text-2xl leading-tight">
              {meeting.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
            </h2>
            {timeLabel && <p className="mt-1 text-sm font-semibold">{timeLabel}</p>}
            <Button
              variant="outline"
              className="mt-4 border-(--primary-border) bg-foreground text-primary hover:bg-foreground/90 dark:bg-card"
              nativeButton={false}
              render={<Link href="/portal/attendance">Check in</Link>}
            />
          </>
        ) : (
          <p className="mt-1.5 text-sm font-semibold">No more meeting days are set this quarter.</p>
        )}
      </section>

      <section className="rounded-[22px] border bg-card" aria-labelledby="home-tasks">
        <div className="flex items-center justify-between px-5 pt-5 pb-2">
          <h2 id="home-tasks" className="text-lg">
            Your week
          </h2>
          <Link href="/portal/tasks" className="text-sm font-semibold text-link underline-offset-4 hover:underline">
            All tasks
          </Link>
        </div>
        {open.length === 0 ? (
          <p className="px-5 pt-1 pb-5 text-sm text-muted-foreground">You&apos;re all caught up. Nothing is waiting on you.</p>
        ) : (
          <ul className="pb-2">
            {open.map((t) => {
              const chip = dueChip(t.due_date, today);
              return (
                <li key={t.id} className="flex items-center gap-3 border-t px-5 py-3 first:border-t-0">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={t.project ? `/portal/projects/${t.project.id}` : "/portal/tasks"}
                      className="block truncate text-[0.9375rem] font-semibold hover:underline"
                    >
                      {t.task_name}
                    </Link>
                    {t.project && <p className="truncate text-sm text-muted-foreground">{t.project.client_name}</p>}
                  </div>
                  <Badge variant={chip.variant}>{chip.label}</Badge>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="rounded-[22px] border bg-card p-5" aria-labelledby="home-projects">
        <h2 id="home-projects" className="text-lg">
          Your projects
        </h2>
        {projects.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">You aren&apos;t on a project this quarter yet.</p>
        ) : (
          <ul className="mt-3 space-y-2.5">
            {projects.map((p) => (
              <li key={p.id}>
                <Link href={`/portal/projects/${p.id}`} className="block rounded-xl bg-muted px-4 py-3 hover:bg-muted/70">
                  <span className="block text-[0.9375rem] font-semibold">{p.client_name}</span>
                  {p.project_manager && <span className="block text-sm text-muted-foreground">PM: {p.project_manager.name}</span>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  );
}
