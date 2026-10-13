"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateReviewSettingsAction } from "@/actions/recruit-review";
import type { ScoringBundle } from "@/lib/data/recruit-scoring";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";

export function ReviewSettingsCard({ setup }: { setup: ScoringBundle["reviewSetup"] }) {
  const { settings, execs, pool } = setup;
  const [perApplicant, setPerApplicant] = useState(String(settings.perApplicant));
  const [checked, setChecked] = useState<Set<string>>(() => new Set(pool.map((p) => p.id)));
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function toggle(id: string, on: boolean) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function save() {
    startTransition(async () => {
      const everyone = checked.size === execs.length;
      const out = await updateReviewSettingsAction({
        perApplicant: Number(perApplicant),
        // An empty pool setting means "every exec", so new execs are included automatically.
        pool: everyone ? [] : [...checked],
      });
      if (out.error) {
        toast.error(out.error);
        return;
      }
      toast.success("Reviewer settings saved.");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Reviewers</CardTitle>
        <CardDescription>Who reads applications, and how many people read each one.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="per-applicant">Reviewers per applicant</FieldLabel>
            <Input
              id="per-applicant"
              type="number"
              min="1"
              max="10"
              step="1"
              className="w-28"
              value={perApplicant}
              onChange={(e) => setPerApplicant(e.target.value)}
            />
            <FieldDescription>
              Each applicant is read by this many people, who can&apos;t see each other&apos;s scores until all of them have submitted.
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel>Who reviews applications</FieldLabel>
            <ul className="space-y-2">
              {execs.map((p) => (
                <li key={p.id} className="flex items-center gap-2 text-sm">
                  <Checkbox id={`reviewer-${p.id}`} checked={checked.has(p.id)} onCheckedChange={(v) => toggle(p.id, v === true)} />
                  <label htmlFor={`reviewer-${p.id}`}>{p.name}</label>
                </li>
              ))}
            </ul>
            <FieldDescription>
              Changes apply the next time you press Assign reviewers. People removed here keep their finished reviews.
            </FieldDescription>
          </Field>
        </FieldGroup>
        <Button size="sm" disabled={isPending || checked.size === 0} onClick={save}>
          Save reviewer settings
        </Button>
      </CardContent>
    </Card>
  );
}
