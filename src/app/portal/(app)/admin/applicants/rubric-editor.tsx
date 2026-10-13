"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Archive, ArchiveRestore, Pencil, Plus } from "lucide-react";
import {
  createCriterionAction,
  reorderCriteriaAction,
  setCriterionArchivedAction,
  updateCriterionAction,
  updateRecruitSettingsAction,
  updateRubricScaleAction,
} from "@/actions/recruit";
import type { CriterionRow, RubricRow } from "@/lib/data/recruit-scoring";
import type { RecruitSettings } from "@/lib/recruit-settings";
import { STAGES } from "@/lib/recruit-scoring";
import { ANSWER_KEYS, ANSWER_LABELS, isAnswerKey, type AnswerKey } from "@/lib/recruit-rubric-levels";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";

function CriterionDialog({ rubric, criterion, trigger }: { rubric: RubricRow; criterion?: CriterionRow; trigger: React.ReactElement }) {
  const isEdit = !!criterion;
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(criterion?.name ?? "");
  const [description, setDescription] = useState(criterion?.description ?? "");
  const [weight, setWeight] = useState(String(criterion?.weight ?? 1));
  const [answerKey, setAnswerKey] = useState<AnswerKey | "none">(criterion?.answerKey ?? "none");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function submit() {
    startTransition(async () => {
      const input = { name, description, answerKey: answerKey === "none" ? null : answerKey, weight: Number(weight) };
      const result = isEdit
        ? await updateCriterionAction(criterion.id, input)
        : await createCriterionAction({ stage: rubric.stage, ...input });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(isEdit ? "Criterion updated — scores recalculated." : "Criterion added.");
      setOpen(false);
      if (!isEdit) {
        setName("");
        setDescription("");
        setAnswerKey("none");
        setWeight("1");
      }
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit criterion" : "New criterion"}</DialogTitle>
          <DialogDescription>
            What reviewers rate. Changing the weight recalculates every score right away; past ratings are kept.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="criterion-name">Name</FieldLabel>
            <Input id="criterion-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Problem solving" />
          </Field>
          <Field>
            <FieldLabel htmlFor="criterion-description">What each score means</FieldLabel>
            <Textarea
              id="criterion-description"
              rows={Math.max(4, Math.floor(rubric.scaleMax - rubric.scaleMin) + 1)}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={Array.from({ length: Math.floor(rubric.scaleMax - rubric.scaleMin) + 1 }, (_, i) => `${rubric.scaleMin + i} = …`).join("\n")}
            />
            <FieldDescription>One line per score, like &ldquo;3 = Readable, reasoning is partly clear&rdquo;. Reviewers see a line when they hover that number.</FieldDescription>
          </Field>
          {rubric.stage === "resume" && (
            <Field>
              <FieldLabel htmlFor="criterion-answer">Scores this part of the application</FieldLabel>
              <Select value={answerKey} onValueChange={(v) => v && setAnswerKey(isAnswerKey(v) ? v : "none")}>
                <SelectTrigger id="criterion-answer" className="w-full">
                  <SelectValue>{(value: string) => (isAnswerKey(value) ? ANSWER_LABELS[value] : "Overall (no single answer)")}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Overall (no single answer)</SelectItem>
                  {ANSWER_KEYS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {ANSWER_LABELS[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription>Reviewers see a tick next to that answer once they score this line.</FieldDescription>
            </Field>
          )}
          <Field>
            <FieldLabel htmlFor="criterion-weight">Weight</FieldLabel>
            <Input id="criterion-weight" type="number" min="0" step="0.5" value={weight} onChange={(e) => setWeight(e.target.value)} />
            <FieldDescription>Relative importance. A weight of 2 counts twice as much as 1.</FieldDescription>
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button disabled={isPending || !name.trim() || weight.trim() === ""} onClick={submit}>
            {isEdit ? "Save" : "Add criterion"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RubricEditor({ rubric }: { rubric: RubricRow }) {
  const [isPending, startTransition] = useTransition();
  const [min, setMin] = useState(String(rubric.scaleMin));
  const [max, setMax] = useState(String(rubric.scaleMax));
  const router = useRouter();
  const label = STAGES.find((s) => s.value === rubric.stage)?.label ?? rubric.stage;
  const active = rubric.criteria.filter((c) => !c.archived);
  const archived = rubric.criteria.filter((c) => c.archived);
  const scaleChanged = Number(min) !== rubric.scaleMin || Number(max) !== rubric.scaleMax;

  function run(action: () => Promise<{ error?: string }>, success?: string) {
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        toast.error(result.error);
        return;
      }
      if (success) toast.success(success);
      router.refresh();
    });
  }

  function move(index: number, delta: -1 | 1) {
    const ids = active.map((c) => c.id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    run(() => reorderCriteriaAction(ids));
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle className="text-base">{label} rubric</CardTitle>
          <CardDescription>What reviewers rate for the {label.toLowerCase()} stage. Any exec can change it at any time.</CardDescription>
        </div>
        <CriterionDialog
          rubric={rubric}
          trigger={
            <Button size="sm">
              <Plus />
              New criterion
            </Button>
          }
        />
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="divide-y rounded-lg border">
          {active.map((c, i) => (
            <li key={c.id} className="flex items-start gap-2 p-2.5 text-sm">
              <div className="flex flex-col">
                <Button size="icon-xs" variant="ghost" aria-label={`Move ${c.name} up`} disabled={isPending || i === 0} onClick={() => move(i, -1)}>
                  <ArrowUp />
                </Button>
                <Button size="icon-xs" variant="ghost" aria-label={`Move ${c.name} down`} disabled={isPending || i === active.length - 1} onClick={() => move(i, 1)}>
                  <ArrowDown />
                </Button>
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-medium">{c.name}</div>
                {c.description && <div className="line-clamp-2 text-xs whitespace-pre-line text-muted-foreground">{c.description}</div>}
              </div>
              <Badge variant="secondary">weight {c.weight}</Badge>
              <CriterionDialog
                rubric={rubric}
                criterion={c}
                trigger={
                  <Button size="icon-sm" variant="ghost" aria-label={`Edit ${c.name}`}>
                    <Pencil />
                  </Button>
                }
              />
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={`Archive ${c.name}`}
                disabled={isPending}
                onClick={() => run(() => setCriterionArchivedAction(c.id, true), `${c.name} archived — old scores still count.`)}
              >
                <Archive />
              </Button>
            </li>
          ))}
          {active.length === 0 && <li className="p-3 text-sm text-muted-foreground">No criteria yet. Add the first one so reviewers have something to score.</li>}
        </ul>

        {archived.length > 0 && (
          <div>
            <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Archived</h4>
            <ul className="divide-y rounded-lg border">
              {archived.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 p-2.5 text-sm text-muted-foreground">
                  <span>{c.name}</span>
                  <Button size="sm" variant="ghost" disabled={isPending} onClick={() => run(() => setCriterionArchivedAction(c.id, false), `${c.name} restored.`)}>
                    <ArchiveRestore />
                    Restore
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="space-y-2 rounded-lg border p-3">
          <h4 className="text-sm font-medium">Scale</h4>
          <div className="flex flex-wrap items-center gap-2">
            <Input aria-label="Lowest score" className="w-20" type="number" value={min} onChange={(e) => setMin(e.target.value)} />
            <span className="text-sm text-muted-foreground">to</span>
            <Input aria-label="Highest score" className="w-20" type="number" value={max} onChange={(e) => setMax(e.target.value)} />
            <Button
              size="sm"
              variant="outline"
              disabled={isPending || !scaleChanged}
              onClick={() => run(() => updateRubricScaleAction(rubric.stage, { scaleMin: Number(min), scaleMax: Number(max) }), "Scale updated.")}
            >
              Save scale
            </Button>
          </div>
          {scaleChanged && (
            <p className="text-xs text-status-warn-foreground">
              Heads up: scores already given are kept as they are and will be read on the new scale.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function ScoringSettingsCard({ settings }: { settings: RecruitSettings }) {
  const [isPending, startTransition] = useTransition();
  const [minN, setMinN] = useState(String(settings.normalizeMinN));
  const [threshold, setThreshold] = useState(String(settings.disagreementThreshold));
  const router = useRouter();
  const dirty = Number(minN) !== settings.normalizeMinN || Number(threshold) !== settings.disagreementThreshold;

  function save() {
    startTransition(async () => {
      const result = await updateRecruitSettingsAction({ normalizeMinN: Number(minN), disagreementThreshold: Number(threshold) });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Scoring settings saved.");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Scoring settings</CardTitle>
        <CardDescription>How scores from different reviewers are combined.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="normalize-min">Scores a reviewer needs before they&apos;re evened out</FieldLabel>
            <Input id="normalize-min" type="number" min="2" step="1" className="w-28 max-w-28" value={minN} onChange={(e) => setMinN(e.target.value)} />
            <FieldDescription>
              Some reviewers grade everyone high and others low. Once someone has given this many scores, their scores are adjusted
              to the group&apos;s typical range. Below it, their raw scores are used. Raw and adjusted are always both shown.
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="disagreement">Flag reviewers who differ by at least</FieldLabel>
            <Input id="disagreement" type="number" min="0" step="0.5" className="w-28 max-w-28" value={threshold} onChange={(e) => setThreshold(e.target.value)} />
            <FieldDescription>When two reviewers&apos; raw scores for the same applicant are this far apart, the applicant gets a &ldquo;reviewers disagree&rdquo; flag.</FieldDescription>
          </Field>
        </FieldGroup>
        <Button size="sm" disabled={isPending || !dirty} onClick={save}>
          Save settings
        </Button>
      </CardContent>
    </Card>
  );
}
