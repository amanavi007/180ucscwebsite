"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { TriangleAlert, UserPlus } from "lucide-react";
import { addApplicantAction, checkApplicantMatchesAction, type MatchPreview } from "@/actions/recruit";
import { classifyAddResult } from "@/lib/recruit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";

export function AddApplicantDialog({
  quarterId,
  trigger,
  open: controlledOpen,
  onOpenChange,
}: {
  quarterId: string;
  trigger?: React.ReactElement;
  /** Pass `open` to control the dialog from outside (for example from a menu); it then renders no trigger of its own. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [innerOpen, setInnerOpen] = useState(false);
  const controlled = controlledOpen !== undefined;
  const open = controlled ? controlledOpen : innerOpen;
  const setOpen = (next: boolean) => {
    if (!controlled) setInnerOpen(next);
    onOpenChange?.(next);
  };
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [major, setMajor] = useState("");
  const [year, setYear] = useState("");
  // Matches are stored with the exact name/email they were computed for, so results for an
  // earlier input can never be shown (or used to confirm a save) for the current one.
  const [checked, setChecked] = useState<{ key: string; matches: MatchPreview[] } | null>(null);
  const [isPending, startTransition] = useTransition();
  const requestId = useRef(0);
  const router = useRouter();

  const inputKey = `${name.trim().toLowerCase()}|${email.trim().toLowerCase()}`;

  // Live duplicate check, debounced; stale responses are ignored.
  const shouldCheck = open && (name.trim().length >= 2 || email.includes("@"));
  useEffect(() => {
    if (!shouldCheck) return;
    const id = ++requestId.current;
    const timer = setTimeout(async () => {
      const result = await checkApplicantMatchesAction({ quarterId, name, email });
      if (id === requestId.current) setChecked({ key: inputKey, matches: result.matches });
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldCheck, quarterId, inputKey]);

  const liveMatches = shouldCheck && checked?.key === inputKey ? checked.matches : [];
  const hardDuplicate = liveMatches.find((m) => m.kind === "duplicate");
  const softMatches = liveMatches.filter((m) => m.kind !== "duplicate");

  function reset() {
    setName("");
    setEmail("");
    setMajor("");
    setYear("");
    setChecked(null);
  }

  function submit() {
    startTransition(async () => {
      const result = await addApplicantAction({
        quarterId,
        name,
        email,
        major,
        year,
        confirmDuplicate: softMatches.length > 0,
      });
      const outcome = classifyAddResult(result);
      if (outcome === "error") {
        toast.error(result.error);
        return;
      }
      if (outcome === "needs-confirm") {
        // The server found a possible duplicate the live check hadn't shown yet: show it and wait for a second click.
        const fresh = await checkApplicantMatchesAction({ quarterId, name, email });
        setChecked({ key: inputKey, matches: fresh.matches });
        toast.warning("This might be someone already added. Check the warning, then click Add anyway.");
        return;
      }
      toast.success(`${name.trim()} added.`);
      setOpen(false);
      reset();
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      {!controlled && (
        <DialogTrigger
          render={
            trigger ?? (
              <Button size="sm">
                <UserPlus />
                Add applicant
              </Button>
            )
          }
        />
      )}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add applicant</DialogTitle>
          <DialogDescription>Only the name is required. You can add the rest later.</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="applicant-name">Name</FieldLabel>
            <Input id="applicant-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jessica Kim" />
          </Field>
          <Field>
            <FieldLabel htmlFor="applicant-email">UCSC email (optional)</FieldLabel>
            <Input
              id="applicant-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jkim@ucsc.edu"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel htmlFor="applicant-major">Major (optional)</FieldLabel>
              <Input id="applicant-major" value={major} onChange={(e) => setMajor(e.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="applicant-year">Year (optional)</FieldLabel>
              <Input id="applicant-year" value={year} onChange={(e) => setYear(e.target.value)} placeholder="2028" />
            </Field>
          </div>
        </FieldGroup>

        {hardDuplicate && (
          <p className="flex items-start gap-2 rounded-lg border border-status-bad-foreground/30 bg-status-bad p-3 text-sm text-status-bad-foreground">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <span>
              <b>{hardDuplicate.name}</b> already has that email. Open them from the list instead of adding a second record.
            </span>
          </p>
        )}
        {!hardDuplicate && softMatches.length > 0 && (
          <div className="rounded-lg border border-status-warn-foreground/30 bg-status-warn p-3 text-sm text-status-warn-foreground">
            <p className="flex items-center gap-2 font-medium">
              <TriangleAlert className="size-4" /> This might be someone already added:
            </p>
            <ul className="mt-1 list-disc pl-6">
              {softMatches.map((m) => (
                <li key={m.applicantId}>
                  {m.name}
                  {m.email ? ` (${m.email})` : ""}
                </li>
              ))}
            </ul>
            <p className="mt-1 text-muted-foreground">If it&apos;s a different person, go ahead and add them anyway.</p>
          </div>
        )}

        <DialogFooter>
          <Button disabled={isPending || !name.trim() || !!hardDuplicate} onClick={submit}>
            {softMatches.length > 0 ? "Add anyway" : "Add applicant"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
