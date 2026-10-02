"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { recropApprovedPhoto, removeMyListing, saveTeamProfile } from "@/actions/team-profiles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { BIO_MAX, validateSubmission } from "@/lib/team-page";
import { PhotoField } from "./photo-field";

export interface TeamProfileFormValues {
  bio: string;
  linkedinUrl: string;
  major: string;
  photoPath: string | null;
}

export function TeamProfileForm({
  targetId,
  mode,
  initial,
  approvedPhotoPath = null,
  onSaved,
}: {
  targetId: string;
  mode: "member" | "exec";
  initial: TeamProfileFormValues;
  /** The member's live, exec-approved photo (null if they have none yet). */
  approvedPhotoPath?: string | null;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [isPending, startTransition] = useTransition();
  const bioLength = Array.from(values.bio).length;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const check = validateSubmission(values);
    if (!check.ok) {
      toast.error(check.error);
      return;
    }
    startTransition(async () => {
      const result = await saveTeamProfile(targetId, values);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(mode === "member" ? "Submitted for review." : "Saved.");
      onSaved?.();
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} noValidate className="@container">
      <div className="grid gap-6 @2xl:grid-cols-[16rem_1fr] @2xl:gap-10">
        <Field>
          <FieldLabel>Photo</FieldLabel>
          <PhotoField
            ownerId={targetId}
            value={values.photoPath}
            onChange={(photoPath) => setValues((v) => ({ ...v, photoPath }))}
            disabled={isPending}
            approvedPath={approvedPhotoPath}
            onRecropApproved={async (area) => {
              const result = await recropApprovedPhoto(targetId, area);
              if (result.path) router.refresh();
              return result;
            }}
          />
        </Field>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="tp-major">Major</FieldLabel>
            <Input id="tp-major" value={values.major} maxLength={80} placeholder="Business Economics" onChange={(e) => setValues((v) => ({ ...v, major: e.target.value }))} />
          </Field>
          <Field>
            <FieldLabel htmlFor="tp-linkedin">LinkedIn</FieldLabel>
            <Input id="tp-linkedin" value={values.linkedinUrl} placeholder="linkedin.com/in/your-name" onChange={(e) => setValues((v) => ({ ...v, linkedinUrl: e.target.value }))} />
          </Field>
          <Field>
            <FieldLabel htmlFor="tp-bio">Bio (optional)</FieldLabel>
            <Textarea id="tp-bio" value={values.bio} rows={3} placeholder="One line about you." onChange={(e) => setValues((v) => ({ ...v, bio: e.target.value }))} />
            <FieldDescription className={bioLength > BIO_MAX ? "text-destructive" : undefined}>
              {bioLength}/{BIO_MAX}. Shows when someone hovers or taps your photo.
            </FieldDescription>
          </Field>
        </FieldGroup>
      </div>
      <div className="mt-4 flex justify-end">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving..." : mode === "member" ? "Submit for review" : "Save"}
        </Button>
      </div>
    </form>
  );
}

export function RemoveListingButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          const result = await removeMyListing();
          if (result.error) {
            toast.error(result.error);
            return;
          }
          toast.success("You've been removed from the team page.");
          router.refresh();
        })
      }
    >
      Remove me from the team page
    </Button>
  );
}
