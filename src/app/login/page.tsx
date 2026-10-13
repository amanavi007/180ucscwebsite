"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff } from "lucide-react";
import { login } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthShell } from "@/components/auth-shell";
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldError,
} from "@/components/ui/field";

const schema = z.object({
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(1, "Password is required."),
});

type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  async function onSubmit(values: FormValues) {
    setServerError(null);
    setSubmitting(true);
    const result = await login(values.email, values.password);
    setSubmitting(false);
    if (result?.error) {
      setServerError(result.error);
    }
  }

  return (
    <AuthShell
      headline="Consulting for good, run by students."
      tagline="Your projects, your team and everything the club needs from you this week, in one place."
      footnote="Members and execs only"
    >
      <h2 className="text-4xl font-extrabold tracking-[-0.03em]">Welcome back</h2>
      <p className="mt-2 mb-8 text-base text-muted-foreground">Sign in with the email the club gave you.</p>

      <form onSubmit={handleSubmit(onSubmit)} noValidate aria-label="Sign in">
        <FieldGroup>
          <Field data-invalid={!!errors.email}>
            <FieldLabel htmlFor="email" className="text-sm font-semibold">
              Email
            </FieldLabel>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@180dc.org"
              className="h-12 rounded-[14px] border-border-strong px-4 text-base"
              {...register("email")}
            />
            <FieldError errors={[errors.email]} />
          </Field>

          <Field data-invalid={!!errors.password}>
            <FieldLabel htmlFor="password" className="text-sm font-semibold">
              Password
            </FieldLabel>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                className="h-12 rounded-[14px] border-border-strong px-4 pr-12 text-base"
                {...register("password")}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-[14px] text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                {showPassword ? <EyeOff className="size-4.5" /> : <Eye className="size-4.5" />}
              </button>
            </div>
            <FieldError errors={[errors.password]} />
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
            {submitting ? "Signing in..." : "Sign in"}
          </Button>

          <p className="text-center text-sm leading-relaxed text-muted-foreground">
            Accounts are created by your chapter admin. Contact an exec if you don&apos;t have login credentials.
          </p>
        </FieldGroup>
      </form>
    </AuthShell>
  );
}
