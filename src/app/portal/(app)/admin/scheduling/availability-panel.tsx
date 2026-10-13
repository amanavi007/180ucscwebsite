"use client";

import { useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { removeAvailabilityBlockAction } from "@/actions/coffee-chat";
import { removeInterviewAvailabilityAction } from "@/actions/interview";
import { removeClientMeetingAvailabilityAction } from "@/actions/client-meeting";
import type { AvailabilityRow } from "@/lib/data/coffee-chat";
import type { InterviewAvailabilityRow } from "@/lib/data/interview";
import type { ClientMeetingAvailabilityRow } from "@/lib/data/client-meeting";
import { formatTimeRange } from "@/lib/coffee-chat";
import { formatDateLong } from "@/lib/date";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export type AvailabilityKind = "coffee" | "interview" | "client";

const SHORT: Record<AvailabilityKind, string> = { coffee: "Coffee chats", interview: "Interviews", client: "Client calls" };

interface Entry {
  key: string;
  date: string;
  startTime: string;
  endTime: string;
  /** The row id for each kind this block is saved under. */
  ids: Partial<Record<AvailabilityKind, string>>;
}

/** When you are free, as one list across coffee chats, interviews and client calls. Remove a block here to remove it everywhere. */
export function AvailabilityPanel({
  today,
  currentExecId,
  coffee,
  interviews,
  clients,
  onAdd,
}: {
  today: string;
  currentExecId: string;
  coffee: AvailabilityRow[];
  interviews: InterviewAvailabilityRow[];
  clients: ClientMeetingAvailabilityRow[];
  onAdd: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const entries = useMemo(() => {
    const tagged = [
      ...coffee.map((r) => ({ kind: "coffee" as const, r })),
      ...interviews.map((r) => ({ kind: "interview" as const, r })),
      ...clients.map((r) => ({ kind: "client" as const, r })),
    ];
    const merged = new Map<string, Entry>();
    for (const { kind, r } of tagged) {
      if (r.execId !== currentExecId || r.date < today) continue;
      const start = r.startTime.slice(0, 5);
      const end = r.endTime.slice(0, 5);
      const key = `${r.date}|${start}|${end}`;
      const entry: Entry = merged.get(key) ?? { key, date: r.date, startTime: start, endTime: end, ids: {} };
      merged.set(key, { ...entry, ids: { ...entry.ids, [kind]: r.id } });
    }
    return [...merged.values()].sort((a, b) => `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`));
  }, [coffee, interviews, clients, currentExecId, today]);

  function remove(entry: Entry) {
    startTransition(async () => {
      for (const kind of Object.keys(entry.ids) as AvailabilityKind[]) {
        const id = entry.ids[kind]!;
        const result =
          kind === "coffee"
            ? await removeAvailabilityBlockAction(id)
            : kind === "interview"
              ? await removeInterviewAvailabilityAction(id)
              : await removeClientMeetingAvailabilityAction(id);
        if (result.error) {
          toast.error(`${SHORT[kind]}: ${result.error}`);
          router.refresh();
          return;
        }
      }
      toast.success("Removed.");
      router.refresh();
    });
  }

  return (
    <section aria-labelledby="availability-heading" className="rounded-[22px] border bg-card p-5">
      <h2 id="availability-heading" className="text-lg">
        Your availability
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">When you can host or sit on a panel. Slots are made from these.</p>

      {entries.length === 0 ? (
        <p className="mt-4 rounded-2xl bg-muted px-4 py-4 text-sm text-muted-foreground">You haven&apos;t added any availability yet.</p>
      ) : (
        <ul className="mt-3 max-h-80 overflow-y-auto">
          {entries.map((e) => {
            const kinds = Object.keys(e.ids) as AvailabilityKind[];
            return (
              <li key={e.key} className="flex items-center gap-3 border-t py-2.5 first:border-t-0">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{formatDateLong(e.date)}</p>
                  <p className="text-sm text-muted-foreground tabular-nums">{formatTimeRange(e.startTime, e.endTime)}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {kinds.length === 3 ? <Badge variant="muted">All three</Badge> : kinds.map((k) => <Badge key={k} variant="muted">{SHORT[k]}</Badge>)}
                  </div>
                </div>
                <Button variant="ghost" size="icon-sm" aria-label="Remove this availability" disabled={isPending} onClick={() => remove(e)}>
                  <Trash2 />
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      <Button variant="outline" className="mt-4 w-full" onClick={onAdd}>
        <Plus />
        Add availability
      </Button>
    </section>
  );
}
