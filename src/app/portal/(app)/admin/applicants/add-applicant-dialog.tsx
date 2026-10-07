"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { TriangleAlert, UserPlus } from "lucide-react";
import { addApplicantAction, checkApplicantMatchesAction, type MatchPreview } from "@/actions/recruit";
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

export function AddApplicantDialog({ quarterId, trigger }: { quarterId: string; trigger?: React.ReactElement }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [major, setMajor] = useState("");
  const [year, setYear] = useState("");
  const [matches, setMatches] = useState<MatchPreview[]>([]);
  const [isPending, startTransition] = useTransition();
  const requestId = useRef(0);
  const router = useRouter();

  // Live duplicate check, debounced; stale responses are ignored.
  const shouldCheck = open && (name.trim().length >= 2 || email.includes("@"));
  useEffect(() => {
    if (!shouldCheck) return;
    const id = ++requestId.current;
    const timer = setTimeout(async () => {
      const result = await checkApplicantMatchesAction({ quarterId, name, email });
      if (id === requestId.current) setMatches(result.matches);
    }, 350);
    return () => clearTimeout(timer);
  }, [shouldCheck, quarterId, name, email]);

  // Results from an earlier check are hidden (not cleared in an effect) once there's nothing to check.
  const liveMatches = shouldCheck ? matches : [];
  const hardDuplicate = liveMatches.find((m) => m.kind === "duplicate");
  const softMatches = liveMatches.filter((m) => m.kind !== "duplicate");

  function reset() {
    setName("");
    setEmail("");
    setMajor("");
    setYear("");
    setMatches([]);
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
      if (result.error) {
        toast.error(result.error);
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
          <p className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <span>
              <b>{hardDuplicate.name}</b> already has that email. Open them from the list instead of adding a second record.
            </span>
          </p>
        )}
        {!hardDuplicate && softMatches.length > 0 && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-500/40 dark:bg-amber-500/10">
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
