"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { addAvailabilityEntryAction, removeAvailabilityBlockAction } from "@/actions/coffee-chat";
import { addInterviewAvailabilityAction, removeInterviewAvailabilityAction } from "@/actions/interview";
import { addClientMeetingAvailabilityAction, removeClientMeetingAvailabilityAction } from "@/actions/client-meeting";
import { formatDateLong } from "@/lib/date";
import { describeInterviewWindow, isInInterviewWindow, type InterviewWindow } from "@/lib/interview";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { AvailabilityKind } from "./availability-panel";

const KINDS: { kind: AvailabilityKind; label: string }[] = [
  { kind: "coffee", label: "Coffee chats" },
  { kind: "interview", label: "Interviews" },
  { kind: "client", label: "Client calls" },
];

export interface EditableEntry {
  date: string;
  startTime: string;
  endTime: string;
  ids: Partial<Record<AvailabilityKind, string>>;
}

/**
 * Changes one block's date, times and which kinds it is for. The new version is added first and the old one removed
 * after, so a failed save never leaves you with nothing; an already-booked slot keeps its booking either way.
 */
export function EditAvailabilityDialog({
  entry,
  today,
  onClientPanel,
  interviewWindow,
  onClose,
}: {
  entry: EditableEntry | null;
  today: string;
  onClientPanel: boolean;
  interviewWindow: InterviewWindow;
  onClose: () => void;
}) {
  return (
    <Dialog open={entry !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        {entry && (
          <EditForm
            key={`${entry.date}|${entry.startTime}|${entry.endTime}`}
            entry={entry}
            today={today}
            onClientPanel={onClientPanel}
            interviewWindow={interviewWindow}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function EditForm({
  entry,
  today,
  onClientPanel,
  interviewWindow,
  onClose,
}: {
  entry: EditableEntry;
  today: string;
  onClientPanel: boolean;
  interviewWindow: InterviewWindow;
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [date, setDate] = useState(entry.date);
  const [startTime, setStartTime] = useState(entry.startTime);
  const [endTime, setEndTime] = useState(entry.endTime);
  const [kinds, setKinds] = useState<AvailabilityKind[]>(Object.keys(entry.ids) as AvailabilityKind[]);

  const timeChanged = date !== entry.date || startTime !== entry.startTime || endTime !== entry.endTime;

  function save() {
    if (kinds.length === 0) {
      toast.error("Pick at least one kind of slot, or use the bin to remove this block.");
      return;
    }
    if (!date || date < today) {
      toast.error("Pick a day that hasn't passed.");
      return;
    }
    if (!startTime || !endTime || endTime <= startTime) {
      toast.error("The end time has to be after the start time.");
      return;
    }
    if (kinds.includes("interview") && !isInInterviewWindow(date, interviewWindow)) {
      toast.error(`Interviews only run ${describeInterviewWindow(interviewWindow)}.`);
      return;
    }

    startTransition(async () => {
      // Add the new version of every kind that needs one. A kind whose row is untouched is left alone.
      for (const kind of kinds) {
        if (entry.ids[kind] && !timeChanged) continue;
        const dates = [date];
        const blocks = [{ startTime, endTime }];
        const result =
          kind === "coffee"
            ? await addAvailabilityEntryAction(dates, blocks)
            : kind === "interview"
              ? await addInterviewAvailabilityAction(dates, blocks)
              : await addClientMeetingAvailabilityAction(dates, blocks);
        if (result.error) {
          toast.error(`${KINDS.find((k) => k.kind === kind)?.label}: ${result.error}`);
          router.refresh();
          return;
        }
      }
      // Then retire the old rows that were replaced or unticked.
      for (const kind of Object.keys(entry.ids) as AvailabilityKind[]) {
        if (kinds.includes(kind) && !timeChanged) continue;
        const id = entry.ids[kind]!;
        const result =
          kind === "coffee"
            ? await removeAvailabilityBlockAction(id)
            : kind === "interview"
              ? await removeInterviewAvailabilityAction(id)
              : await removeClientMeetingAvailabilityAction(id);
        if (result.error) {
          toast.error(`${KINDS.find((k) => k.kind === kind)?.label}: ${result.error}`);
          router.refresh();
          return;
        }
      }
      toast.success("Availability updated.");
      onClose();
      router.refresh();
    });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit availability</DialogTitle>
        <DialogDescription>{formatDateLong(entry.date)}</DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <label className="block space-y-1 text-sm font-semibold">
          Day
          <Input type="date" value={date} min={today} onChange={(e) => setDate(e.target.value)} />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <Input type="time" aria-label="Start time" className="w-36" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          <span className="text-sm text-muted-foreground">to</span>
          <Input type="time" aria-label="End time" className="w-36" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
        </div>
        <div className="space-y-2">
          <p className="text-sm font-bold">What is it for?</p>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {KINDS.map(({ kind, label }) => {
              const disabled = kind === "client" && !onClientPanel && !entry.ids.client;
              return (
                <label key={kind} className={`flex items-center gap-2 text-sm font-semibold ${disabled ? "opacity-50" : ""}`}>
                  <Checkbox
                    checked={kinds.includes(kind)}
                    disabled={disabled}
                    onCheckedChange={(checked) =>
                      setKinds((cur) => (checked === true ? [...cur, kind] : cur.filter((k) => k !== kind)))
                    }
                  />
                  {label}
                </label>
              );
            })}
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={isPending}>
          Cancel
        </Button>
        <Button size="lg" onClick={save} disabled={isPending}>
          Save changes
        </Button>
      </DialogFooter>
    </>
  );
}
