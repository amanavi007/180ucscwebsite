"use client";

import { COMPARE_FIELDS, diffAgainst, type CompareField, type DuplicateGroup, type ParsedApplication } from "@/lib/recruit-applications";
import { Button } from "@/components/ui/button";
import { StatusChip } from "./status-chip";

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "No timestamp";

function Answer({ app, field, against, differs }: { app: ParsedApplication; field: CompareField; against: ParsedApplication; differs: boolean }) {
  const value = app[field];
  if (!value) return <span className="text-muted-foreground">Blank</span>;
  if (!differs || app === against) return <>{value}</>;
  return (
    <>
      {diffAgainst(value, against[field]).map((seg, i) => (
        <span key={i}>
          {i > 0 && " "}
          {seg.changed ? <mark className="rounded-sm bg-status-warn px-0.5 text-status-warn-foreground">{seg.text}</mark> : seg.text}
        </span>
      ))}
    </>
  );
}

/** Everyone who submitted the form more than once, side by side, with what differs highlighted. */
export function DuplicateSubmissions({
  groups,
  picks,
  onPick,
}: {
  groups: DuplicateGroup[];
  picks: Record<string, number>;
  onPick: (email: string, rowNumber: number) => void;
}) {
  const identicalCount = groups.filter((g) => g.differing.length === 0).length;
  return (
    <section className="space-y-3">
      <div>
        <h3 className="font-medium">
          {groups.length} {groups.length === 1 ? "person" : "people"} submitted more than once
        </h3>
        <p className="text-sm text-muted-foreground">
          {identicalCount === groups.length
            ? "Every repeat has the same answers, so nothing is lost."
            : `${identicalCount} of ${groups.length} are identical. Compare the rest and pick the one to import. Changed words are highlighted.`}
        </p>
      </div>
      <ul className="space-y-3">
        {groups.map((g) => {
          const chosenRow = picks[g.email] ?? g.keptRow;
          const reference = g.submissions.find((s) => s.rowNumber === chosenRow) ?? g.submissions[0];
          const fields = COMPARE_FIELDS.filter((f) => g.differing.includes(f.key));
          return (
            <li key={g.email} className="space-y-3 rounded-lg border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm">
                  <span className="font-medium">{reference.name}</span> <span className="text-muted-foreground">{g.email}</span>
                </div>
                {g.differing.length === 0 ? (
                  <StatusChip tone="ok">Identical answers</StatusChip>
                ) : (
                  <StatusChip tone="warn">
                    {g.differing.length} {g.differing.length === 1 ? "answer differs" : "answers differ"}
                  </StatusChip>
                )}
              </div>

              <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${g.submissions.length}, minmax(0, 1fr))` }}>
                {g.submissions.map((s) => {
                  const selected = s.rowNumber === chosenRow;
                  return (
                    <div key={s.rowNumber} className="space-y-2">
                      <div className="flex items-center justify-between gap-2 text-[13px] text-muted-foreground">
                        <span>
                          Row {s.rowNumber} · {when(s.submittedAt)}
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          variant={selected ? "default" : "outline"}
                          aria-pressed={selected}
                          onClick={() => onPick(g.email, s.rowNumber)}
                        >
                          {selected ? "Importing this one" : "Use this one"}
                        </Button>
                      </div>
                      {fields.map((f) => (
                        <div key={f.key}>
                          <p className="text-[13px] font-medium">{f.label}</p>
                          <p className="text-sm whitespace-pre-wrap">
                            <Answer app={s} field={f.key} against={s === reference ? (g.submissions.find((o) => o !== reference) ?? s) : reference} differs />
                          </p>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
              {g.differing.length === 0 && (
                <p className="text-[13px] text-muted-foreground">Only the submission time is different. Name, major, graduation, resume and all three essays match.</p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
