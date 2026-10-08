"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { ImportAction, ReviewRow } from "@/lib/recruit-import";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Applicant = { id: string; name: string; email: string | null };

function Group({
  title,
  hint,
  count,
  tone,
  defaultOpen,
  children,
}: {
  title: string;
  hint?: string;
  count: number;
  tone: string;
  defaultOpen: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (count === 0) return null;
  return (
    <section className="rounded-xl border">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 px-3 py-2 text-left">
        {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        <span className="font-medium">{title}</span>
        <Badge className={tone}>{count}</Badge>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </button>
      {open && <div className="divide-y border-t">{children}</div>}
    </section>
  );
}

function Name({ row }: { row: ReviewRow }) {
  return (
    <div className="min-w-0">
      <div className="truncate font-medium">{row.attendee.rawName || "(no name)"}</div>
      <div className="text-xs text-muted-foreground">
        {[row.attendee.email, row.attendee.minutes !== null ? `${Math.round(row.attendee.minutes)} min` : null]
          .filter(Boolean)
          .join(" · ")}
      </div>
    </div>
  );
}

export function ImportReview({
  rows,
  applicants,
  actions,
  onChange,
}: {
  rows: ReviewRow[];
  applicants: Applicant[];
  actions: Record<string, ImportAction>;
  onChange: (key: string, action: ImportAction) => void;
}) {
  const byId = new Map(applicants.map((a) => [a.id, a]));
  const of = (group: ReviewRow["group"]) => rows.filter((r) => r.group === group);
  const isAward = (key: string) => actions[key]?.action === "award";

  return (
    <div className="space-y-3">
      <Group title="Needs a look" count={of("needs-look").length} tone="bg-amber-100 text-amber-900" defaultOpen hint="Confirm who each of these is">
        {of("needs-look").map((row) => {
          const action = actions[row.key];
          return (
            <div key={row.key} className="space-y-2 p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Name row={row} />
                {action?.action === "award" && (
                  <Badge variant="secondary">→ {byId.get(action.applicantId)?.name ?? "Chosen applicant"}</Badge>
                )}
                {action?.action === "new" && <Badge variant="secondary">→ New person</Badge>}
                {action?.action === "skip" && <Badge variant="outline">Skipped</Badge>}
              </div>
              <p className="text-xs text-muted-foreground">{row.reason}</p>
              <div className="flex flex-wrap items-center gap-2">
                {row.candidates.slice(0, 3).map((c) => (
                  <Button
                    key={c.applicantId}
                    size="sm"
                    variant={action?.action === "award" && action.applicantId === c.applicantId ? "default" : "outline"}
                    onClick={() => onChange(row.key, { action: "award", applicantId: c.applicantId })}
                  >
                    Yes, {byId.get(c.applicantId)?.name ?? "this person"}
                  </Button>
                ))}
                <Select value="" onValueChange={(v) => v && onChange(row.key, { action: "award", applicantId: v })}>
                  <SelectTrigger size="sm" className="w-44">
                    <SelectValue placeholder="Pick someone else">{() => "Pick someone else"}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {applicants.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" variant={action?.action === "new" ? "default" : "outline"} onClick={() => onChange(row.key, { action: "new" })}>
                  Add as new person
                </Button>
                <Button size="sm" variant="ghost" onClick={() => onChange(row.key, { action: "skip" })}>
                  Skip
                </Button>
              </div>
            </div>
          );
        })}
      </Group>

      <Group title="New people" count={of("new").length} tone="bg-blue-100 text-blue-900" defaultOpen hint="Will be added as applicants">
        {of("new").map((row) => (
          <div key={row.key} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
            <Name row={row} />
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant={actions[row.key]?.action === "new" ? "default" : "outline"}
                onClick={() => onChange(row.key, { action: actions[row.key]?.action === "new" ? "skip" : "new" })}
              >
                {actions[row.key]?.action === "new" ? "Adding" : "Add"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => onChange(row.key, { action: "ignore" })}>
                Ignore this name
              </Button>
            </div>
          </div>
        ))}
      </Group>

      <Group title="Matched" count={of("matched").length} tone="bg-green-100 text-green-900" defaultOpen={false} hint="Exact matches — will get points">
        {of("matched").map((row) => (
          <div key={row.key} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
            <Name row={row} />
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">→ {byId.get(row.applicantId ?? "")?.name}</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  onChange(row.key, isAward(row.key) ? { action: "skip" } : { action: "award", applicantId: row.applicantId! })
                }
              >
                {isAward(row.key) ? "Skip" : "Include"}
              </Button>
            </div>
          </div>
        ))}
      </Group>

      <Group title="Already has points" count={of("already").length} tone="bg-slate-100 text-slate-900" defaultOpen={false} hint="Skipped so nobody is counted twice">
        {of("already").map((row) => (
          <div key={row.key} className="p-3 text-sm">
            <Name row={row} />
            <p className="text-xs text-muted-foreground">→ {byId.get(row.applicantId ?? "")?.name}</p>
          </div>
        ))}
      </Group>

      <Group title="Ignored" count={of("ignored").length} tone="bg-slate-100 text-slate-900" defaultOpen={false} hint="Hosts, short stays, your ignore list">
        {of("ignored").map((row) => (
          <div key={row.key} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
            <Name row={row} />
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{row.reason}</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onChange(row.key, actions[row.key]?.action === "new" ? { action: "skip" } : { action: "new" })}
              >
                {actions[row.key]?.action === "new" ? "Not adding" : "Add as new person"}
              </Button>
            </div>
          </div>
        ))}
      </Group>
    </div>
  );
}
