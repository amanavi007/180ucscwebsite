"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { awardPointsAction } from "@/actions/recruit";
import type { ApplicantRow, RecruitCategory, RecruitEvent } from "@/lib/data/recruit";
import { validateAward } from "@/lib/recruit";
import { formatDateLong } from "@/lib/date";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const NO_EVENT = "none";

interface Props {
  applicant: ApplicantRow | null;
  categories: RecruitCategory[];
  events: RecruitEvent[];
  onOpenChange: (open: boolean) => void;
}

export function GivePointsDialog({ applicant, categories, events, onOpenChange }: Props) {
  return (
    <Dialog open={!!applicant} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {/* Keyed by applicant so every open starts from a clean form without effects. */}
        {applicant && (
          <GivePointsForm
            key={applicant.id}
            applicant={applicant}
            categories={categories}
            events={events}
            onOpenChange={onOpenChange}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function GivePointsForm({
  applicant,
  categories,
  events,
  onOpenChange,
}: {
  applicant: ApplicantRow;
  categories: RecruitCategory[];
  events: RecruitEvent[];
  onOpenChange: (open: boolean) => void;
}) {
  const choices = categories.filter((c) => !c.archived);
  const [categoryId, setCategoryId] = useState<string>(choices[0]?.id ?? "");
  const [eventId, setEventId] = useState<string>(NO_EVENT);
  const [points, setPoints] = useState(String(choices[0]?.defaultPoints ?? 0));
  const [reason, setReason] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const category = choices.find((c) => c.id === categoryId);
  const categoryEvents = events.filter((e) => e.categoryId === categoryId);
  const numeric = Number(points);
  const problem = points.trim() === "" ? "Enter the points." : validateAward({ points: numeric, reason });

  function pickCategory(id: string) {
    setCategoryId(id);
    setEventId(NO_EVENT);
    const next = choices.find((c) => c.id === id);
    if (next) setPoints(String(next.defaultPoints));
  }

  function submit() {
    startTransition(async () => {
      const result = await awardPointsAction({
        applicantId: applicant.id,
        categoryId,
        eventId: eventId === NO_EVENT ? null : eventId,
        points: numeric,
        reason,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`Gave ${applicant.name} ${numeric > 0 ? "+" : ""}${numeric} point${Math.abs(numeric) === 1 ? "" : "s"}.`);
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Give points to {applicant.name}</DialogTitle>
        <DialogDescription>
          Pick what it&apos;s for. The usual points fill in, and you can change them for this one entry.
        </DialogDescription>
      </DialogHeader>

      {choices.length === 0 ? (
        <p className="text-sm text-muted-foreground">There are no active categories yet. Add one in the Setup tab first.</p>
      ) : (
        <FieldGroup>
          <Field>
            <FieldLabel>What for</FieldLabel>
            <Select value={categoryId} onValueChange={(v) => v && pickCategory(v)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Pick a category">
                  {(value: string) => choices.find((c) => c.id === value)?.name}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {choices.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} ({c.defaultPoints > 0 ? "+" : ""}
                    {c.defaultPoints})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          {categoryEvents.length > 0 && (
            <Field>
              <FieldLabel>Which event (optional)</FieldLabel>
              <Select value={eventId} onValueChange={(v) => v && setEventId(v)}>
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {(value: string) =>
                      value === NO_EVENT ? "No specific event" : categoryEvents.find((e) => e.id === value)?.name
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_EVENT}>No specific event</SelectItem>
                  {categoryEvents.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name} · {formatDateLong(e.date)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}

          <Field>
            <FieldLabel htmlFor="points-value">Points</FieldLabel>
            <Input id="points-value" type="number" step="0.5" value={points} onChange={(e) => setPoints(e.target.value)} />
            {category && Number(points) !== category.defaultPoints && (
              <FieldDescription>The usual for {category.name} is {category.defaultPoints}.</FieldDescription>
            )}
          </Field>

          <Field>
            <FieldLabel htmlFor="points-reason">
              Reason {numeric < 0 ? "(required for negative points)" : "(optional)"}
            </FieldLabel>
            <Textarea
              id="points-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder={numeric < 0 ? "Didn't show up to the coffee chat and didn't let us know" : "Anything worth remembering"}
            />
          </Field>
        </FieldGroup>
      )}

      <DialogFooter>
        {problem && choices.length > 0 && <span className="mr-auto self-center text-sm text-muted-foreground">{problem}</span>}
        <Button disabled={isPending || !!problem || !categoryId} onClick={submit}>
          Give points
        </Button>
      </DialogFooter>
    </>
  );
}
