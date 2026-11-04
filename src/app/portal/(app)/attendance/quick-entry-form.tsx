"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { AttendanceMark } from "@/lib/supabase/database.types";

const MARK_OPTIONS: { value: AttendanceMark; label: string }[] = [
  { value: "excused", label: "Excused" },
  { value: "unexcused", label: "Unexcused" },
  { value: "tardy", label: "Tardy" },
];

const MARK_LABELS: Record<AttendanceMark, string> = {
  excused: "Excused",
  unexcused: "Unexcused",
  tardy: "Tardy",
};

const MARK_BADGE_CLASS: Record<AttendanceMark, string> = {
  excused: "bg-muted text-muted-foreground border-transparent",
  unexcused: "bg-status-bad text-status-bad-foreground border-transparent",
  tardy: "bg-status-warn text-status-warn-foreground border-transparent",
};

/** What a saved day looks like: absent kinds only, since no mark means present. */
export interface EntrySession {
  marks: { id: string; mark: AttendanceMark }[];
}

export interface EntryPerson {
  id: string;
  name: string;
}

function marksFromSession(session: EntrySession | null): Record<string, AttendanceMark> {
  if (!session) return {};
  return Object.fromEntries(session.marks.map((m) => [m.id, m.mark]));
}

/** Shared by team attendance and JC onboarding attendance; the caller supplies how a day is loaded and saved. */
export function QuickEntryForm({
  roster,
  today,
  initialSession,
  loadSession,
  save,
  emptyText = "No team members yet.",
}: {
  roster: EntryPerson[];
  today: string;
  initialSession: EntrySession | null;
  loadSession: (date: string) => Promise<EntrySession | null>;
  save: (input: {
    date: string;
    excusedIds: string[];
    unexcusedIds: string[];
    tardyIds: string[];
  }) => Promise<{ error?: string }>;
  emptyText?: string;
}) {
  const [date, setDate] = useState(today);
  const [marks, setMarks] = useState<Record<string, AttendanceMark>>(
    marksFromSession(initialSession),
  );
  // Whether a session is already logged for the selected date (past dates with one are locked).
  const [hasSession, setHasSession] = useState(!!initialSession);
  const [isPending, startTransition] = useTransition();
  const [isLoadingDate, setIsLoadingDate] = useState(false);
  const router = useRouter();

  function onDateChange(newDate: string) {
    setDate(newDate);
    setIsLoadingDate(true);
    startTransition(async () => {
      try {
        const session = newDate === today ? initialSession : await loadSession(newDate);
        setHasSession(!!session);
        setMarks(marksFromSession(session));
      } catch {
        toast.error("Couldn't load attendance for that date. Try again.");
      } finally {
        setIsLoadingDate(false);
      }
    });
  }

  function toggleMark(userId: string, mark: AttendanceMark) {
    setMarks((prev) => {
      const next = { ...prev };
      if (next[userId] === mark) {
        delete next[userId];
      } else {
        next[userId] = mark;
      }
      return next;
    });
  }

  function onSubmit() {
    const excusedIds = Object.entries(marks)
      .filter(([, m]) => m === "excused")
      .map(([id]) => id);
    const unexcusedIds = Object.entries(marks)
      .filter(([, m]) => m === "unexcused")
      .map(([id]) => id);
    const tardyIds = Object.entries(marks)
      .filter(([, m]) => m === "tardy")
      .map(([id]) => id);

    startTransition(async () => {
      const result = await save({
        date,
        excusedIds,
        unexcusedIds,
        tardyIds,
      });
      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success(`Attendance saved for ${date}.`);
        router.refresh();
      }
    });
  }

  const presentCount = roster.length - Object.keys(marks).length;
  // Past dates that already have a record stay read-only -- editing one should be a
  // deliberate action, not a side effect of browsing history via the date picker.
  // Past dates with no record yet can be backfilled; future dates can't be logged.
  const isBackfill = date < today && !hasSession;
  const readOnly = date > today || (date < today && hasSession);

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="flex items-center gap-3">
          <label htmlFor="session-date" className="text-sm font-medium">
            Date
          </label>
          <Input
            id="session-date"
            type="date"
            value={date}
            onChange={(e) => onDateChange(e.target.value)}
            className="w-44"
          />
          {readOnly && (
            <Badge variant="outline">
              {date > today ? "Read-only: future date" : "Read-only: already logged"}
            </Badge>
          )}
          {isBackfill && <Badge variant="outline">Backfill: not logged yet</Badge>}
        </div>

        <p className="text-sm text-muted-foreground">
          {readOnly ? (
            <>
              <span className="font-medium text-foreground">{presentCount} present</span> of{" "}
              {roster.length}.
            </>
          ) : (
            <>
              Tap a name into Excused, Unexcused, or Tardy. Everyone else is present.{" "}
              <span className="font-medium text-foreground">{presentCount} present</span> of{" "}
              {roster.length}.
            </>
          )}
        </p>

        <div className="divide-y rounded-md border">
          {roster.map((m) => (
            <div
              key={m.id}
              className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
            >
              <span className="text-sm font-medium">{m.name}</span>
              {readOnly ? (
                <Badge
                  variant="outline"
                  className={
                    marks[m.id]
                      ? MARK_BADGE_CLASS[marks[m.id]]
                      : "bg-muted text-muted-foreground border-transparent"
                  }
                >
                  {marks[m.id] ? MARK_LABELS[marks[m.id]] : "Present"}
                </Badge>
              ) : (
                <div className="flex gap-1.5">
                  {MARK_OPTIONS.map((opt) => {
                    const active = marks[m.id] === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        disabled={isPending || isLoadingDate}
                        onClick={() => toggleMark(m.id, opt.value)}
                        className={cn(
                          "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                          active
                            ? "border-(--primary-border) bg-primary text-primary-foreground"
                            : "border-input bg-background hover:bg-muted",
                        )}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
          {roster.length === 0 && (
            <p className="px-3 py-4 text-sm text-muted-foreground">{emptyText}</p>
          )}
        </div>

        <Button
          onClick={onSubmit}
          disabled={readOnly || isPending || isLoadingDate || roster.length === 0}
        >
          Save attendance
        </Button>
      </CardContent>
    </Card>
  );
}
