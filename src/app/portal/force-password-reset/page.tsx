"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { changePassword } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthShell } from "@/components/auth-shell";
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldDescription,
  FieldError,
} from "@/components/ui/field";

const schema = z
  .object({
    password: z.string().min(8, "Use at least 8 characters."),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match.",
    path: ["confirmPassword"],
  });

type FormValues = z.infer<typeof schema>;

export default function ForcePasswordResetPage() {
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  async function onSubmit(values: FormValues) {
    setServerError(null);
    setSubmitting(true);
    const result = await changePassword(values.password);
    setSubmitting(false);
    if (result?.error) {
      setServerError(result.error);
    }
  }

  return (
    <AuthShell
      headline="Almost in. Make it yours."
      tagline="Your account started with a temporary password, so pick your own before you do anything else."
      footnote="Step 1 of 1"
      accent="lilac"
    >
      <h2 className="text-4xl font-extrabold tracking-[-0.03em]">Set a new password</h2>
      <p className="mt-2 mb-8 text-base text-muted-foreground">You&apos;ll use this every time you sign in.</p>

      <form onSubmit={handleSubmit(onSubmit)} noValidate aria-label="Set a new password">
        <FieldGroup>
          <Field data-invalid={!!errors.password}>
            <FieldLabel htmlFor="password" className="text-sm font-semibold">
              New password
            </FieldLabel>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              className="h-12 rounded-[14px] border-border-strong px-4 text-base"
              {...register("password")}
            />
            <FieldDescription>At least 8 characters.</FieldDescription>
            <FieldError errors={[errors.password]} />
          </Field>

          <Field data-invalid={!!errors.confirmPassword}>
            <FieldLabel htmlFor="confirmPassword" className="text-sm font-semibold">
              Type it again
            </FieldLabel>
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              className="h-12 rounded-[14px] border-border-strong px-4 text-base"
              {...register("confirmPassword")}
            />
            <FieldError errors={[errors.confirmPassword]} />
          </Field>

          {serverError && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-[14px] bg-status-bad px-3.5 py-3 text-sm leading-snug text-status-bad-foreground"
            >
              <span aria-hidden className="font-extrabold">
                !
              </span>
              <span>{serverError}</span>
            </div>
          )}

          <Button type="submit" size="lg" disabled={submitting} className="h-12 w-full rounded-[14px] text-base">
            {submitting ? "Saving..." : "Save and continue"}
          </Button>
        </FieldGroup>
      </form>
    </AuthShell>
  );
}
