"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Undo2 } from "lucide-react";
import { dismissDuplicateAction, mergeApplicantsAction, undoMergeAction } from "@/actions/recruit";
import type { ApplicantRow, MergeLogRow } from "@/lib/data/recruit";
import type { DuplicatePair } from "@/lib/recruit-matching";
import { needsEmailChoice } from "@/lib/recruit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const REASON_TEXT: Record<DuplicatePair["reason"], string> = {
  email: "Same email",
  name: "Same name",
  alias: "Matches a saved display name",
  fuzzy: "Similar names",
};

function PersonCard({ person }: { person: ApplicantRow }) {
  return (
    <div className="flex-1 rounded-lg border p-3 text-sm">
      <div className="font-medium">{person.name}</div>
      <div className="text-muted-foreground">{person.email ?? "No email yet"}</div>
      <div className="text-muted-foreground">{[person.major, person.year].filter(Boolean).join(" · ") || "No major or year"}</div>
      <div className="mt-1">
        {person.total} pt{person.total === 1 ? "" : "s"} · {person.entries.filter((e) => !e.voidedAt).length} entries
      </div>
    </div>
  );
}

function PairCard({ a, b, pair }: { a: ApplicantRow; b: ApplicantRow; pair: DuplicatePair }) {
  const [keepEmail, setKeepEmail] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const emailChoice = needsEmailChoice(a, b);
  const blocked = emailChoice && !keepEmail;

  function merge(survivor: ApplicantRow, absorbed: ApplicantRow) {
    startTransition(async () => {
      const result = await mergeApplicantsAction({
        survivorId: survivor.id,
        absorbedId: absorbed.id,
        keepEmail: emailChoice ? keepEmail : null,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`Merged ${absorbed.name} into ${survivor.name}. You can undo this below.`);
      router.refresh();
    });
  }

  function dismiss() {
    startTransition(async () => {
      const result = await dismissDuplicateAction(a.id, b.id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Got it — they won't be suggested again.");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardContent className="space-y-3 pt-4">
        <div className="flex items-center gap-2 text-sm">
          <Badge variant={pair.kind === "maybe" ? "outline" : "secondary"}>{REASON_TEXT[pair.reason]}</Badge>
          <span className="text-muted-foreground">{pair.score}% match</span>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <PersonCard person={a} />
          <PersonCard person={b} />
        </div>

        {emailChoice && (
          <fieldset className="space-y-1 text-sm">
            <legend className="font-medium">They have different emails — which one should the merged record keep?</legend>
            {[a.email, b.email].map((email) => (
              <label key={email} className="flex items-center gap-2">
                <input type="radio" name={`email-${a.id}-${b.id}`} checked={keepEmail === email} onChange={() => setKeepEmail(email)} />
                {email}
              </label>
            ))}
          </fieldset>
        )}

        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={isPending || blocked} onClick={() => merge(a, b)}>
            Merge into {a.name}
          </Button>
          <Button size="sm" disabled={isPending || blocked} onClick={() => merge(b, a)}>
            Merge into {b.name}
          </Button>
          <Button size="sm" variant="outline" disabled={isPending} onClick={dismiss}>
            Not the same person
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Merging moves all points and saved names to the record you keep. You can undo a merge from the list below.
        </p>
      </CardContent>
    </Card>
  );
}

export function DuplicatesView({
  rows,
  pairs,
  merges,
}: {
  rows: ApplicantRow[];
  pairs: DuplicatePair[];
  merges: MergeLogRow[];
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const byId = new Map(rows.map((r) => [r.id, r]));

  function undo(id: string) {
    startTransition(async () => {
      const result = await undoMergeAction(id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Merge undone.");
      router.refresh();
    });
  }

  return (
    <div className="mt-4 space-y-6">
      <section className="space-y-3">
        <h2 className="text-sm font-medium">Possible duplicates</h2>
        {pairs.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            No duplicates to check. If someone is entered twice later, they&apos;ll show up here.
          </p>
        ) : (
          pairs.map((p) => {
            const a = byId.get(p.a);
            const b = byId.get(p.b);
            return a && b ? <PairCard key={`${p.a}:${p.b}`} a={a} b={b} pair={p} /> : null;
          })
        )}
      </section>

      {merges.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium">Recent merges</h2>
          <ul className="divide-y rounded-lg border">
            {merges.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-2 p-2.5 text-sm">
                <span>
                  <b>{m.absorbedName}</b> merged into <b>{m.survivorName}</b>
                  <span className="text-muted-foreground"> · {new Date(m.createdAt).toLocaleDateString()}</span>
                </span>
                <Button size="sm" variant="outline" disabled={isPending} onClick={() => undo(m.id)}>
                  <Undo2 />
                  Undo
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
