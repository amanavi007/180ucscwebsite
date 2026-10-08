"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileUp, Undo2 } from "lucide-react";
import { commitImportAction, createEventAction, reviewImportAction, undoImportAction } from "@/actions/recruit";
import type { RecruitCategory, RecruitEvent } from "@/lib/data/recruit";
import {
  buildCommitRows,
  defaultActions,
  summarizeActions,
  type ImportAction,
  type ReviewRow,
} from "@/lib/recruit-import";
import { formatDateLong } from "@/lib/date";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ImportReview } from "./import-review";

const NEW_EVENT = "new";
const NO_EVENT = "none";

type Step = "input" | "review" | "done";
type Applicant = { id: string; name: string; email: string | null };

export function ImportDialog({
  quarterId,
  categories,
  events,
}: {
  quarterId: string;
  categories: RecruitCategory[];
  events: RecruitEvent[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm" variant="outline">
            <FileUp />
            Import list
          </Button>
        }
      />
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        {/* Remounted on every open so each import starts from a clean state. */}
        {open && <ImportFlow quarterId={quarterId} categories={categories} events={events} onClose={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function ImportFlow({
  quarterId,
  categories,
  events,
  onClose,
}: {
  quarterId: string;
  categories: RecruitCategory[];
  events: RecruitEvent[];
  onClose: () => void;
}) {
  const choices = categories.filter((c) => !c.archived);
  const infoSession = choices.find((c) => c.systemKey === "info_session") ?? choices[0];
  const [step, setStep] = useState<Step>("input");
  const [categoryId, setCategoryId] = useState(infoSession?.id ?? "");
  const [eventId, setEventId] = useState<string>(NEW_EVENT);
  const [newName, setNewName] = useState("");
  const [newDate, setNewDate] = useState("");
  const [points, setPoints] = useState(String(infoSession?.defaultPoints ?? 1));
  const [minMinutes, setMinMinutes] = useState("10");
  const [text, setText] = useState("");
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [actions, setActions] = useState<Record<string, ImportAction>>({});
  const [resolvedEventId, setResolvedEventId] = useState<string | null>(null);
  const [result, setResult] = useState<{ batchId: string; awarded: number; created: number; skipped: number } | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const category = choices.find((c) => c.id === categoryId);
  const categoryEvents = events.filter((e) => e.categoryId === categoryId);
  const isNewEvent = eventId === NEW_EVENT;
  const canReview =
    !!categoryId && text.trim().length > 0 && Number.isFinite(Number(points)) && (!isNewEvent || (newName.trim() && newDate));

  function pickCategory(id: string) {
    setCategoryId(id);
    setEventId(NEW_EVENT);
    const next = choices.find((c) => c.id === id);
    if (next) setPoints(String(next.defaultPoints));
  }

  async function readFile(file: File | undefined) {
    if (!file) return;
    setText(await file.text());
  }

  function review() {
    startTransition(async () => {
      let useEventId: string | null = eventId === NO_EVENT || isNewEvent ? null : eventId;
      if (isNewEvent) {
        const created = await createEventAction({ quarterId, categoryId, name: newName, date: newDate });
        if (created.error || !created.eventId) {
          toast.error(created.error ?? "Couldn't create the event.");
          return;
        }
        useEventId = created.eventId;
        setEventId(created.eventId);
      }
      const reviewed = await reviewImportAction({ quarterId, text, eventId: useEventId, minMinutes: Number(minMinutes) });
      if (reviewed.error || !reviewed.rows) {
        toast.error(reviewed.error ?? "Couldn't read that list.");
        return;
      }
      setResolvedEventId(useEventId);
      setRows(reviewed.rows);
      setApplicants(reviewed.applicants ?? []);
      setActions(defaultActions(reviewed.rows));
      setStep("review");
    });
  }

  function commit() {
    startTransition(async () => {
      const commitRows = buildCommitRows(
        rows,
        actions,
        applicants.map((a) => ({ id: a.id, name: a.name, email: a.email, aliases: [] })),
      );
      const outcome = await commitImportAction({
        quarterId,
        eventId: resolvedEventId,
        categoryId,
        points: Number(points),
        rows: commitRows,
      });
      if (outcome.error || !outcome.batchId) {
        toast.error(outcome.error ?? "The import didn't go through.");
        return;
      }
      setResult({
        batchId: outcome.batchId,
        awarded: outcome.awarded ?? 0,
        created: outcome.created ?? 0,
        skipped: outcome.skipped ?? 0,
      });
      setStep("done");
      router.refresh();
    });
  }

  function undo() {
    if (!result) return;
    startTransition(async () => {
      const outcome = await undoImportAction(result.batchId);
      if (outcome.error) {
        toast.error(outcome.error);
        return;
      }
      toast.success(`Import undone — ${outcome.voided ?? 0} entries voided.`);
      router.refresh();
      onClose();
    });
  }

  const summary = summarizeActions(rows, actions);

  if (step === "done" && result) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Import complete</DialogTitle>
          <DialogDescription>
            {result.awarded} {result.awarded === 1 ? "person" : "people"} got {Number(points) > 0 ? "+" : ""}
            {points} for {category?.name}
            {result.created > 0 ? `, including ${result.created} new applicant${result.created === 1 ? "" : "s"}` : ""}.
            {result.skipped > 0 ? ` ${result.skipped} were skipped (already had points or no longer exist).` : ""}
          </DialogDescription>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Made a mistake? Undo removes this import&apos;s points and any applicants it created that you haven&apos;t touched.
        </p>
        <DialogFooter>
          <Button variant="outline" disabled={isPending} onClick={undo}>
            <Undo2 />
            Undo this import
          </Button>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </>
    );
  }

  if (step === "review") {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Check before giving points</DialogTitle>
          <DialogDescription>
            {rows.length} names from your list. Only the ones that need you are open — nothing is saved until you confirm.
          </DialogDescription>
        </DialogHeader>
        <ImportReview
          rows={rows}
          applicants={applicants}
          actions={actions}
          onChange={(key, action) => setActions((prev) => ({ ...prev, [key]: action }))}
        />
        <DialogFooter className="items-center">
          <span className="mr-auto text-sm text-muted-foreground">
            <b>{summary.award + summary.create}</b> will get {Number(points) > 0 ? "+" : ""}
            {points}
            {summary.create > 0 ? ` (${summary.create} new)` : ""}
            {summary.unresolved > 0 ? ` · ${summary.unresolved} still need a look and will be skipped` : ""}
          </span>
          <Button variant="ghost" onClick={() => setStep("input")}>
            Back
          </Button>
          <Button disabled={isPending || summary.award + summary.create === 0} onClick={commit}>
            Give points
          </Button>
        </DialogFooter>
      </>
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Import an attendee list</DialogTitle>
        <DialogDescription>
          Paste names from an in-person sign-in sheet, or upload the participants report from Zoom. You&apos;ll check anything
          uncertain before points are given.
        </DialogDescription>
      </DialogHeader>
      <FieldGroup>
        <Field>
          <FieldLabel>What is this for?</FieldLabel>
          <Select value={categoryId} onValueChange={(v) => v && pickCategory(v)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Pick a category">{(v: string) => choices.find((c) => c.id === v)?.name}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {choices.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field>
          <FieldLabel>Which event?</FieldLabel>
          <Select value={eventId} onValueChange={(v) => v && setEventId(v)}>
            <SelectTrigger className="w-full">
              <SelectValue>
                {(v: string) =>
                  v === NEW_EVENT ? "Create a new event…" : v === NO_EVENT ? "No specific event" : categoryEvents.find((e) => e.id === v)?.name
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NEW_EVENT}>Create a new event…</SelectItem>
              {categoryEvents.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.name} · {formatDateLong(e.date)}
                </SelectItem>
              ))}
              <SelectItem value={NO_EVENT}>No specific event</SelectItem>
            </SelectContent>
          </Select>
          <FieldDescription>Attaching an event also stops anyone being counted twice if you import a second list.</FieldDescription>
        </Field>

        {isNewEvent && (
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel htmlFor="import-event-name">Event name</FieldLabel>
              <Input id="import-event-name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Info Session 1" />
            </Field>
            <Field>
              <FieldLabel htmlFor="import-event-date">Date</FieldLabel>
              <Input id="import-event-date" type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
            </Field>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel htmlFor="import-points">Points each</FieldLabel>
            <Input id="import-points" type="number" step="0.5" value={points} onChange={(e) => setPoints(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="import-min">Zoom: minimum minutes</FieldLabel>
            <Input id="import-min" type="number" min="0" value={minMinutes} onChange={(e) => setMinMinutes(e.target.value)} />
            <FieldDescription>People who stayed less than this are ignored. 0 turns it off.</FieldDescription>
          </Field>
        </div>

        <Field>
          <FieldLabel htmlFor="import-text">Names</FieldLabel>
          <Textarea
            id="import-text"
            rows={7}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={"Jessica Kim\nDaniel Ortiz\nAisha Rahman, arahman@ucsc.edu"}
          />
          <div className="flex items-center gap-2">
            <Input type="file" accept=".csv,.txt" aria-label="Upload a Zoom report" onChange={(e) => readFile(e.target.files?.[0])} />
          </div>
          <FieldDescription>One name per line, or upload the CSV from Zoom → Reports → Usage → Participants.</FieldDescription>
        </Field>
      </FieldGroup>
      <DialogFooter>
        <Button disabled={isPending || !canReview} onClick={review}>
          Review list
        </Button>
      </DialogFooter>
    </>
  );
}
