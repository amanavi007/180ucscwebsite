"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { saveRubric } from "@/actions/review-rubrics";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { criteriaToText } from "@/lib/prelim-review/rubric-form";
import { KIND_LABELS, REVIEW_KINDS, type ReviewKind, type Rubric } from "@/lib/prelim-review/rubric";

export function RulesEditor({ rubrics }: { rubrics: Record<ReviewKind, Rubric> }) {
  const router = useRouter();
  const [kind, setKind] = useState<ReviewKind>("doc");
  const [pending, startTransition] = useTransition();
  // One draft per kind, so switching sections never loses typing. Keyed by version so a save resets it.
  const [drafts, setDrafts] = useState<Record<string, { criteria: string; guide: string }>>({});

  const rubric = rubrics[kind];
  const key = `${kind}:${rubric.version}`;
  const saved = { criteria: criteriaToText(rubric.criteria), guide: rubric.guideText };
  const draft = drafts[key] ?? saved;
  const dirty = draft.criteria !== saved.criteria || draft.guide !== saved.guide;

  function setDraft(patch: Partial<typeof saved>) {
    setDrafts((d) => ({ ...d, [key]: { ...draft, ...patch } }));
  }

  function onSave() {
    startTransition(async () => {
      const result = await saveRubric(kind, draft.criteria, draft.guide);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`Rules saved as version ${rubric.version + 1}.`);
      router.refresh();
    });
  }

  return (
    <div className="mt-8 flex flex-wrap items-start gap-x-12 gap-y-6">
      <nav aria-label="Rule sets" className="flex w-52 shrink-0 flex-col gap-1">
        {REVIEW_KINDS.map((k) => (
          <button
            key={k}
            type="button"
            aria-current={kind === k}
            onClick={() => setKind(k)}
            className="rounded-lg px-3 py-2 text-left text-sm font-medium text-foreground/80 transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring aria-[current=true]:bg-accent aria-[current=true]:font-semibold aria-[current=true]:text-accent-foreground"
          >
            {KIND_LABELS[k]}
          </button>
        ))}
      </nav>

      <section aria-labelledby="rules-h" className="min-w-0 flex-1 basis-[32rem] space-y-5">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="rules-h" className="text-xl font-semibold">
            {KIND_LABELS[kind]} rules
          </h2>
          <Badge variant={rubric.version === 0 ? "warn" : "muted"}>
            {rubric.version === 0 ? "Starter rules, not saved yet" : `Version ${rubric.version}`}
          </Badge>
        </div>

        <Field>
          <FieldLabel htmlFor="criteria">Criteria</FieldLabel>
          <p className="max-w-prose text-sm text-muted-foreground">
            One criterion per block: a title line, then what a pass looks like. Separate blocks with a blank line.
          </p>
          <Textarea
            id="criteria"
            rows={14}
            value={draft.criteria}
            onChange={(e) => setDraft({ criteria: e.target.value })}
            disabled={pending}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="guide">Formatting guide</FieldLabel>
          <p className="max-w-prose text-sm text-muted-foreground">
            Paste the chapter&apos;s formatting guide. The reviewer reads it on every run.
          </p>
          <Textarea id="guide" rows={12} value={draft.guide} onChange={(e) => setDraft({ guide: e.target.value })} disabled={pending} />
        </Field>

        <div className="flex items-center gap-3">
          <Button size="lg" onClick={onSave} disabled={pending || !dirty}>
            Save rules
          </Button>
          {!dirty && <span className="text-sm text-muted-foreground">No changes to save</span>}
        </div>
      </section>
    </div>
  );
}
