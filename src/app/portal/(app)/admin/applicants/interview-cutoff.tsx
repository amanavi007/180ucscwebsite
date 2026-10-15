"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { inviteAboveCutoffAction } from "@/actions/interview";
import { updateRecruitSettingsAction } from "@/actions/recruit";
import { useConfirm } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

/** Turns the text box into a cutoff: empty clears it, anything else must be a number. */
function readCutoff(text: string): number | null | undefined {
  if (text.trim() === "") return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : undefined;
}

/** Number box plus Save and Clear. Shared by the list's cutoff bar and the Setup section. */
function CutoffEditor({ cutoff, inputId }: { cutoff: number | null; inputId: string }) {
  const [text, setText] = useState(cutoff === null ? "" : String(cutoff));
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const parsed = readCutoff(text);
  const dirty = parsed !== undefined && parsed !== cutoff;

  function save(value: number | null) {
    startTransition(async () => {
      const result = await updateRecruitSettingsAction({ interviewCutoff: value });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(value === null ? "Interview cutoff cleared." : `Interview cutoff set to ${value}.`);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        id={inputId}
        type="number"
        min="0"
        step="0.5"
        inputMode="decimal"
        className="h-9 w-24 max-w-24"
        value={text}
        placeholder="None"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && dirty && parsed !== undefined) save(parsed);
        }}
      />
      <Button variant="outline" size="sm" disabled={isPending || !dirty} onClick={() => parsed !== undefined && save(parsed)}>
        Save cutoff
      </Button>
      {cutoff !== null && (
        <Button
          variant="ghost"
          size="sm"
          disabled={isPending}
          onClick={() => {
            setText("");
            save(null);
          }}
        >
          Clear
        </Button>
      )}
    </div>
  );
}

/** Sits above the applicant list: change the cutoff and invite everyone above it. */
export function CutoffBar({
  quarterId,
  cutoff,
  aboveCount,
  newInviteCount,
  alreadyInvitedCount,
  noEmailCount,
}: {
  quarterId: string;
  cutoff: number | null;
  aboveCount: number;
  newInviteCount: number;
  alreadyInvitedCount: number;
  noEmailCount: number;
}) {
  const [confirm, confirmDialog] = useConfirm();
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  async function invite() {
    const skipped = noEmailCount > 0 ? ` ${noEmailCount} above the line can't be invited because they have no UCSC email.` : "";
    const ok = await confirm({
      title: `Invite ${newInviteCount} ${newInviteCount === 1 ? "person" : "people"} to book an interview?`,
      description: `They'll be added to the interview invite list so they can book a time. ${alreadyInvitedCount} already invited.${skipped}`,
      confirmLabel: `Add ${newInviteCount} to invites`,
    });
    if (!ok) return;
    startTransition(async () => {
      const result = await inviteAboveCutoffAction(quarterId);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`Added ${result.addedCount ?? 0} to the interview invite list.`);
      router.refresh();
    });
  }

  const setupHref = `/portal/admin/recruiting-setup?quarter=${quarterId}`;

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-xl border bg-card px-5 py-3">
      {cutoff === null ? (
        <p className="text-sm text-muted-foreground">
          No interview cutoff set.{" "}
          <Link href={setupHref} className="font-medium text-link underline-offset-2 hover:underline">
            Set one in Setup
          </Link>{" "}
          to draw the line in this list.
        </p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground tabular-nums">
            <span className="font-medium text-foreground">Interview cutoff {cutoff}</span> · {aboveCount} at or above · {alreadyInvitedCount} invited
            {noEmailCount > 0 && ` · ${noEmailCount} without a UCSC email`} ·{" "}
            <Link href={setupHref} className="font-medium text-link underline-offset-2 hover:underline">
              Change in Setup
            </Link>
          </p>
          <Button
            variant="outline"
            disabled={isPending || newInviteCount === 0}
            title={newInviteCount === 0 ? "Everyone above the line is already invited." : undefined}
            onClick={invite}
          >
            {newInviteCount === 0 ? "Everyone above is invited" : `Invite ${newInviteCount} above the line`}
          </Button>
        </>
      )}
      {confirmDialog}
    </div>
  );
}

/** The Setup section for the same setting. */
export function InterviewCutoffCard({ cutoff }: { cutoff: number | null }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Interview cutoff</CardTitle>
        <CardDescription>The score an applicant needs to be invited to interview.</CardDescription>
      </CardHeader>
      <CardContent>
        <Field>
          <FieldLabel htmlFor="setup-interview-cutoff">Cutoff score</FieldLabel>
          <CutoffEditor key={cutoff ?? "none"} cutoff={cutoff} inputId="setup-interview-cutoff" />
          <FieldDescription>
            Uses the same total as the Applicants ranking: points plus adjusted resume and interview scores. Someone exactly at the
            cutoff is in. The Applicants list draws a line at this score, and you can invite everyone above it from there.
          </FieldDescription>
        </Field>
      </CardContent>
    </Card>
  );
}
