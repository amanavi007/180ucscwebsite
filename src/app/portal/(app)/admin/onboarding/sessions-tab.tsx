"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";
import { setOnboardingDates, submitOnboardingAttendance } from "@/actions/jc-onboarding";
import type { OnboardingData } from "@/lib/data/onboarding";
import { ONBOARDING_MARKS, ONBOARDING_MARK_LABEL } from "@/lib/onboarding-attendance";
import type { OnboardingMark } from "@/lib/supabase/database.types";
import { formatDateLong, parseLocalDate, toDateString } from "@/lib/date";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Segmented } from "../applicants/segmented";

function MeetingPanel({
  meeting,
  data,
  onClose,
}: {
  meeting: OnboardingData["meetings"][number];
  data: OnboardingData;
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const active = data.jcs.filter((j) => !j.removedAt);
  const [marks, setMarks] = useState<Record<string, OnboardingMark>>(() => {
    const saved = new Map(data.marks.filter((m) => m.meetingId === meeting.id).map((m) => [m.jcId, m.mark]));
    return Object.fromEntries(active.map((j) => [j.id, saved.get(j.id) ?? "present"]));
  });

  function save() {
    startTransition(async () => {
      const result = await submitOnboardingAttendance(meeting.id, marks);
      if (result.error) toast.error(result.error);
      else {
        toast.success(`Attendance saved for ${formatDateLong(meeting.date)}.`);
        onClose();
      }
    });
  }

  const counts = ONBOARDING_MARKS.map((m) => [m, active.filter((j) => marks[j.id] === m).length] as const);

  return (
    <aside className="flex min-w-0 flex-col gap-4 rounded-[22px] border bg-card p-5 lg:sticky lg:top-4 lg:self-start">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl">{formatDateLong(meeting.date)}</h2>
          <p className="text-[13px] text-muted-foreground">
            {meeting.taken ? `Taken by ${meeting.takenByName ?? "an exec"}` : "Not taken yet. Everyone starts as present."}
          </p>
        </div>
        <Button variant="ghost" size="icon" aria-label="Close" onClick={onClose}>
          <X />
        </Button>
      </div>

      {active.length === 0 ? (
        <p className="text-sm text-muted-foreground">No JCs on the roster yet. Add them first.</p>
      ) : (
        <ul className="max-h-[55dvh] divide-y overflow-auto">
          {active.map((j) => (
            <li key={j.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <span className="min-w-0 break-words font-semibold">{j.name}</span>
              <Segmented
                size="sm"
                label={`Attendance for ${j.name}`}
                value={marks[j.id] ?? "present"}
                onChange={(v) => setMarks((prev) => ({ ...prev, [j.id]: v }))}
                options={ONBOARDING_MARKS.map((m) => ({ value: m, label: ONBOARDING_MARK_LABEL[m] }))}
              />
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-[13px] text-muted-foreground">
          {counts.map(([m, n]) => `${n} ${ONBOARDING_MARK_LABEL[m].toLowerCase()}`).join(" · ")}
        </span>
        <Button size="lg" onClick={save} disabled={pending || active.length === 0}>
          {meeting.taken ? "Update attendance" : "Save attendance"}
        </Button>
      </div>
    </aside>
  );
}

function DatesCard({
  quarterId,
  quarterStart,
  quarterEnd,
  dates,
}: {
  quarterId: string;
  quarterStart: string;
  quarterEnd: string;
  dates: string[];
}) {
  const [selected, setSelected] = useState<Date[]>(() => dates.map(parseLocalDate));
  const [pending, startTransition] = useTransition();
  const strings = useMemo(() => [...new Set(selected.map(toDateString))].sort(), [selected]);
  const dirty = JSON.stringify(strings) !== JSON.stringify([...dates].sort());

  function save() {
    startTransition(async () => {
      const result = await setOnboardingDates(quarterId, strings);
      if (result.error) toast.error(result.error);
      else toast.success("Onboarding meeting days updated.");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Meeting days</CardTitle>
        <CardDescription>
          Click a date to add or remove it. A day with attendance already taken can&apos;t be removed.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Calendar
          mode="multiple"
          selected={selected}
          onSelect={(d) => setSelected(d ?? [])}
          startMonth={parseLocalDate(quarterStart)}
          endMonth={parseLocalDate(quarterEnd)}
          disabled={{ before: parseLocalDate(quarterStart), after: parseLocalDate(quarterEnd) }}
          className="rounded-md border"
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={save} disabled={pending || !dirty}>
            Save meeting days
          </Button>
          <span className="text-xs text-muted-foreground">
            {strings.length} day{strings.length === 1 ? "" : "s"} selected
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

export function SessionsTab({
  quarterId,
  quarterStart,
  quarterEnd,
  today,
  data,
  takenCount,
}: {
  quarterId: string;
  quarterStart: string;
  quarterEnd: string;
  today: string;
  data: OnboardingData;
  takenCount: number;
}) {
  // Open on the oldest past meeting still waiting for attendance, so "take attendance" is one click away.
  const suggested = data.meetings.find((m) => m.date <= today && !m.taken)?.id ?? null;
  const [openId, setOpenId] = useState<string | null>(suggested);
  const open = data.meetings.find((m) => m.id === openId) ?? null;

  if (data.meetings.length === 0) {
    return (
      <div className="space-y-6">
        <p className="text-sm text-muted-foreground">No onboarding meetings yet. Pick the days below.</p>
        <DatesCard quarterId={quarterId} quarterStart={quarterStart} quarterEnd={quarterEnd} dates={[]} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className={cn("grid gap-6", open && "lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)]")}>
        <div className="min-w-0 space-y-2">
          <p className="text-sm text-muted-foreground">
            {takenCount} of {data.meetings.length} taken. Click a day to take or edit its attendance.
          </p>
          <ul className="max-h-[60dvh] divide-y overflow-auto rounded-[22px] border bg-card">
            {data.meetings.map((m) => {
              const future = m.date > today;
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    disabled={future}
                    onClick={() => setOpenId(m.id)}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default",
                      m.id === openId ? "bg-accent text-accent-foreground" : "hover:bg-muted/60",
                    )}
                  >
                    <span className="min-w-0 font-semibold">{formatDateLong(m.date)}</span>
                    {m.taken ? (
                      <Badge variant="ok">Taken</Badge>
                    ) : future ? (
                      <Badge variant="muted">Upcoming</Badge>
                    ) : (
                      <Badge variant="warn">Needs attendance</Badge>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
        {open && <MeetingPanel key={open.id} meeting={open} data={data} onClose={() => setOpenId(null)} />}
      </div>
      <DatesCard
        quarterId={quarterId}
        quarterStart={quarterStart}
        quarterEnd={quarterEnd}
        dates={data.meetings.map((m) => m.date)}
      />
    </div>
  );
}
