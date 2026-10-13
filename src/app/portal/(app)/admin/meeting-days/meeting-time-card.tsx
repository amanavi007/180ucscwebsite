"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { clearMeetingTimeAction, saveMeetingTimeAction } from "@/actions/meeting-time";
import { formatMeetingTime, type MeetingTime } from "@/lib/meeting-time";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** The time every meeting day runs. With one set, meeting days show at that time on the calendar instead of as all-day. */
export function MeetingTimeCard({ time }: { time: MeetingTime | null }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [start, setStart] = useState(time?.start ?? "");
  const [end, setEnd] = useState(time?.end ?? "");
  const changed = start !== (time?.start ?? "") || end !== (time?.end ?? "");

  function save() {
    startTransition(async () => {
      const result = await saveMeetingTimeAction({ start, end });
      if (result.error) toast.error(result.error);
      else toast.success("Meeting time saved.");
      router.refresh();
    });
  }

  function clear() {
    startTransition(async () => {
      const result = await clearMeetingTimeAction();
      if (result.error) toast.error(result.error);
      else {
        setStart("");
        setEnd("");
        toast.success("Meeting days are all-day again.");
      }
      router.refresh();
    });
  }

  return (
    <section aria-labelledby="meeting-time-heading" className="rounded-[22px] border bg-card p-5">
      <h2 id="meeting-time-heading" className="text-lg">
        Meeting time
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {time
          ? `Meeting days run ${formatMeetingTime(time)}, and show at that time on the calendar.`
          : "No time set, so meeting days show as all-day. Set one and they show at that time on the calendar."}
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm font-semibold">
          From
          <Input type="time" className="w-36" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label className="flex items-center gap-2 text-sm font-semibold">
          to
          <Input type="time" className="w-36" value={end} onChange={(e) => setEnd(e.target.value)} />
        </label>
        <Button onClick={save} disabled={isPending || !changed || !start || !end}>
          Save time
        </Button>
        {time && (
          <Button variant="ghost" onClick={clear} disabled={isPending}>
            Make them all-day
          </Button>
        )}
      </div>
    </section>
  );
}
