"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { submitAttendance, fetchSessionForDate } from "@/actions/attendance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { MembershipWithProfile } from "@/lib/data/types";
import type { SessionWithMarks } from "@/lib/data/attendance";
import type { AttendanceMark } from "@/lib/supabase/database.types";

const MARK_OPTIONS: { value: AttendanceMark; label: string }[] = [
  { value: "excused", label: "Excused" },
  { value: "unexcused", label: "Unexcused" },
  { value: "tardy", label: "Tardy" },
];

function marksFromSession(session: SessionWithMarks | null): Record<string, AttendanceMark> {
  if (!session) return {};
  return Object.fromEntries(session.marks.map((m) => [m.user_id, m.mark]));
}

export function QuickEntryForm({
  projectId,
  roster,
  today,
  initialSession,
}: {
  projectId: string;
  roster: MembershipWithProfile[];
  today: string;
  initialSession: SessionWithMarks | null;
}) {
  const [date, setDate] = useState(today);
  const [marks, setMarks] = useState<Record<string, AttendanceMark>>(
    marksFromSession(initialSession),
  );
  const [isPending, startTransition] = useTransition();
  const [isLoadingDate, setIsLoadingDate] = useState(false);
  const router = useRouter();

  function onDateChange(newDate: string) {
    setDate(newDate);
    setIsLoadingDate(true);
    startTransition(async () => {
      const session = newDate === today ? initialSession : await fetchSessionForDate(projectId, newDate);
      setMarks(marksFromSession(session));
      setIsLoadingDate(false);
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
      const result = await submitAttendance({
        projectId,
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
        </div>

        <p className="text-sm text-muted-foreground">
          Tap a name into Excused, Unexcused, or Tardy. Everyone else is present.{" "}
          <span className="font-medium text-foreground">{presentCount} present</span> of{" "}
          {roster.length}.
        </p>

        <div className="divide-y rounded-md border">
          {roster.map((m) => (
            <div
              key={m.user_id}
              className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
            >
              <span className="text-sm font-medium">{m.profile?.name ?? "Unknown"}</span>
              <div className="flex gap-1.5">
                {MARK_OPTIONS.map((opt) => {
                  const active = marks[m.user_id] === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      disabled={isPending || isLoadingDate}
                      onClick={() => toggleMark(m.user_id, opt.value)}
                      className={cn(
                        "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-input bg-background hover:bg-muted",
                      )}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {roster.length === 0 && (
            <p className="px-3 py-4 text-sm text-muted-foreground">No team members yet.</p>
          )}
        </div>

        <Button onClick={onSubmit} disabled={isPending || isLoadingDate || roster.length === 0}>
          Save attendance
        </Button>
      </CardContent>
    </Card>
  );
}
