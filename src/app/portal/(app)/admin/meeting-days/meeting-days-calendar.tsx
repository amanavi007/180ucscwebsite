"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { RotateCcw, Save } from "lucide-react";
import { setMeetingDatesForQuarter } from "@/actions/meeting-dates";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { parseLocalDate } from "@/lib/date";
import { getMeetingDatesInRange } from "@/lib/attendance";

function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function MeetingDaysCalendar({
  quarterId,
  quarterStartDate,
  quarterEndDate,
  initialDates,
  timeLabel,
}: {
  quarterId: string;
  quarterStartDate: string;
  quarterEndDate: string;
  initialDates: string[];
  /** The time each meeting day runs, when one is set. */
  timeLabel?: string | null;
}) {
  const start = parseLocalDate(quarterStartDate);
  const end = parseLocalDate(quarterEndDate);

  const [selected, setSelected] = useState<Date[]>(() => initialDates.map(parseLocalDate));
  const [isPending, startTransition] = useTransition();

  const selectedStrings = useMemo(
    () => [...new Set(selected.map(toDateString))].sort(),
    [selected],
  );
  const initialSorted = useMemo(() => [...initialDates].sort(), [initialDates]);
  const dirty = JSON.stringify(selectedStrings) !== JSON.stringify(initialSorted);

  function onSave() {
    startTransition(async () => {
      const result = await setMeetingDatesForQuarter(quarterId, selectedStrings);
      if (result?.error) toast.error(result.error);
      else toast.success("Meeting days updated.");
    });
  }

  function onResetToDefault() {
    const defaults = getMeetingDatesInRange(quarterStartDate, quarterEndDate);
    setSelected(defaults.map(parseLocalDate));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Meeting days</CardTitle>
        <CardDescription>
          Click a date to add or remove it as a meeting day. Auto-generated with every
          Tuesday/Thursday in the quarter. Adjust for dead week, holidays, or extra sessions.
          {timeLabel ? ` Every meeting day runs ${timeLabel}.` : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Calendar
          mode="multiple"
          selected={selected}
          onSelect={(dates) => setSelected(dates ?? [])}
          startMonth={start}
          endMonth={end}
          disabled={{ before: start, after: end }}
          className="rounded-md border"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={onSave} disabled={isPending || !dirty} className="gap-1.5">
            <Save className="size-4" />
            Save changes
          </Button>
          <Button
            variant="outline"
            onClick={onResetToDefault}
            disabled={isPending}
            className="gap-1.5"
          >
            <RotateCcw className="size-4" />
            Reset to Tue/Thu default
          </Button>
          <span className="text-xs text-muted-foreground">
            {selectedStrings.length} meeting day{selectedStrings.length === 1 ? "" : "s"} selected
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
