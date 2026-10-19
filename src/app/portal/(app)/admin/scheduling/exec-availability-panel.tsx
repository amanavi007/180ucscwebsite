"use client";

import { useMemo } from "react";
import type { AvailabilityRow } from "@/lib/data/coffee-chat";
import type { InterviewAvailabilityRow } from "@/lib/data/interview";
import type { ClientMeetingAvailabilityRow } from "@/lib/data/client-meeting";
import { formatTimeRange } from "@/lib/coffee-chat";
import { formatDateLong } from "@/lib/date";
import { Badge } from "@/components/ui/badge";
import { PersonAvatar } from "@/components/person-avatar";

type Kind = "coffee" | "interview" | "client";

const SHORT: Record<Kind, string> = { coffee: "Coffee chats", interview: "Interviews", client: "Client calls" };

interface Block {
  key: string;
  date: string;
  startTime: string;
  endTime: string;
  kinds: Kind[];
}

/** Read-only view of every exec's upcoming availability, for the super admin (Director of Projects). */
export function ExecAvailabilityPanel({
  today,
  coffee,
  interviews,
  clients,
}: {
  today: string;
  coffee: AvailabilityRow[];
  interviews: InterviewAvailabilityRow[];
  clients: ClientMeetingAvailabilityRow[];
}) {
  const execs = useMemo(() => {
    const tagged = [
      ...coffee.map((r) => ({ kind: "coffee" as const, r })),
      ...interviews.map((r) => ({ kind: "interview" as const, r })),
      ...clients.map((r) => ({ kind: "client" as const, r })),
    ];
    const byExec = new Map<string, { name: string; blocks: Map<string, Block> }>();
    for (const { kind, r } of tagged) {
      if (r.date < today) continue;
      const start = r.startTime.slice(0, 5);
      const end = r.endTime.slice(0, 5);
      const key = `${r.date}|${start}|${end}`;
      const exec = byExec.get(r.execId) ?? { name: r.execName, blocks: new Map<string, Block>() };
      const block = exec.blocks.get(key) ?? { key, date: r.date, startTime: start, endTime: end, kinds: [] };
      exec.blocks.set(key, { ...block, kinds: [...block.kinds, kind] });
      byExec.set(r.execId, exec);
    }
    return [...byExec.entries()]
      .map(([id, e]) => ({
        id,
        name: e.name,
        blocks: [...e.blocks.values()].sort((a, b) => `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`)),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [coffee, interviews, clients, today]);

  return (
    <section aria-labelledby="exec-availability-heading" className="rounded-[22px] border bg-card p-5">
      <h2 id="exec-availability-heading" className="text-lg">
        Exec availability
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">Everyone&apos;s upcoming free time. Only the Director of Projects sees this.</p>

      {execs.length === 0 ? (
        <p className="mt-4 rounded-2xl bg-muted px-4 py-4 text-sm text-muted-foreground">No exec has added availability yet. Their blocks show up here once they do.</p>
      ) : (
        <div className="mt-3 max-h-96 overflow-y-auto">
          {execs.map((exec) => (
            <details key={exec.id} className="border-t py-2.5 first:border-t-0">
              <summary className="flex cursor-pointer items-center gap-3 rounded-[10px] text-sm font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                <PersonAvatar name={exec.name} className="size-8" />
                <span className="min-w-0 flex-1 truncate">{exec.name}</span>
                <Badge variant="muted">{exec.blocks.length} {exec.blocks.length === 1 ? "block" : "blocks"}</Badge>
              </summary>
              <ul className="mt-2">
                {exec.blocks.map((b) => (
                  <li key={b.key} className="py-1.5">
                    <p className="text-sm font-semibold">{formatDateLong(b.date)}</p>
                    <p className="text-sm text-muted-foreground tabular-nums">{formatTimeRange(b.startTime, b.endTime)}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {b.kinds.length === 3 ? <Badge variant="muted">All three</Badge> : b.kinds.map((k) => <Badge key={k} variant="muted">{SHORT[k]}</Badge>)}
                    </div>
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      )}
    </section>
  );
}
