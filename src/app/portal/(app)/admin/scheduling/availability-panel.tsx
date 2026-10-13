"use client";

import { useState, useTransition } from "react";
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
import { FilterChip } from "@/components/filter-chip";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AvailabilityView as CoffeeAvailability } from "../coffee-chats/availability-view";
import { AvailabilityView as InterviewAvailability } from "../interviews/availability-view";
import { AvailabilityView as ClientAvailability } from "../client-meetings/availability-view";

type Kind = "coffee" | "interview" | "client";

const LABEL: Record<Kind, string> = { coffee: "Coffee chats", interview: "Interviews", client: "Client calls" };
const SINGULAR: Record<Kind, string> = { coffee: "coffee chat", interview: "interview", client: "client call" };

/** When you can host, per kind of slot. Remove a block here; add new ones in the dialog. */
export function AvailabilityPanel({
  today,
  currentExecId,
  coffee,
  interviews,
  clients,
  clientPanelExecIds,
}: {
  today: string;
  currentExecId: string;
  coffee: AvailabilityRow[];
  interviews: InterviewAvailabilityRow[];
  clients: ClientMeetingAvailabilityRow[];
  clientPanelExecIds: string[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [kind, setKind] = useState<Kind>("coffee");
  const [adding, setAdding] = useState(false);

  const rows = (kind === "coffee" ? coffee : kind === "interview" ? interviews : clients)
    .filter((a) => a.execId === currentExecId && a.date >= today)
    .sort((a, b) => `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`));

  function remove(id: string) {
    startTransition(async () => {
      const result =
        kind === "coffee"
          ? await removeAvailabilityBlockAction(id)
          : kind === "interview"
            ? await removeInterviewAvailabilityAction(id)
            : await removeClientMeetingAvailabilityAction(id);
      if (result.error) toast.error(result.error);
      else toast.success("Removed.");
      router.refresh();
    });
  }

  return (
    <section aria-labelledby="availability-heading" className="rounded-[22px] border bg-card p-5">
      <h2 id="availability-heading" className="text-lg">
        Your availability
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">When you can host or sit on a panel. Slots get made from these.</p>

      <div className="mt-4 flex flex-wrap gap-1.5" role="group" aria-label="Kind of slot">
        {(Object.keys(LABEL) as Kind[]).map((k) => (
          <FilterChip key={k} selected={kind === k} onClick={() => setKind(k)}>
            {LABEL[k]}
          </FilterChip>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="mt-4 rounded-2xl bg-muted px-4 py-4 text-sm text-muted-foreground">
          You haven&apos;t added any {SINGULAR[kind]} availability yet.
        </p>
      ) : (
        <ul className="mt-3 max-h-72 overflow-y-auto">
          {rows.map((a) => (
            <li key={a.id} className="flex items-center gap-3 border-t py-2.5 first:border-t-0">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{formatDateLong(a.date)}</p>
                <p className="text-sm text-muted-foreground tabular-nums">{formatTimeRange(a.startTime, a.endTime)}</p>
              </div>
              <Button variant="ghost" size="icon-sm" aria-label="Remove this availability" disabled={isPending} onClick={() => remove(a.id)}>
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Button variant="outline" className="mt-4 w-full" onClick={() => setAdding(true)}>
        <Plus />
        Add {SINGULAR[kind]} availability
      </Button>

      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Add {SINGULAR[kind]} availability</DialogTitle>
            <DialogDescription>Pick the days you&apos;re free and the time blocks. Everyone can book once the slots are published.</DialogDescription>
          </DialogHeader>
          {kind === "coffee" && <CoffeeAvailability availability={coffee} currentExecId={currentExecId} />}
          {kind === "interview" && <InterviewAvailability availability={interviews} currentExecId={currentExecId} />}
          {kind === "client" && (
            <ClientAvailability availability={clients} currentExecId={currentExecId} panelExecIds={clientPanelExecIds} />
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
