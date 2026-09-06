"use client";

import { useState } from "react";
import Image from "next/image";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { login } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
    <div className="flex min-h-svh items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <Image
            src="/logo-stacked-dark.png"
            alt="180 Degrees Consulting UC Santa Cruz"
            width={982}
            height={1374}
            priority
            className="mx-auto h-52 w-auto dark:hidden"
          />
          <Image
            src="/logo-stacked-light.png"
            alt="180 Degrees Consulting UC Santa Cruz"
            width={982}
            height={1374}
            priority
            className="mx-auto hidden h-52 w-auto dark:block"
          />
        </div>

        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <FieldGroup>
            <Field data-invalid={!!errors.email}>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@180dc.org"
                {...register("email")}
              />
              <FieldError errors={[errors.email]} />
            </Field>

            <Field data-invalid={!!errors.password}>
              <FieldLabel htmlFor="password">Password</FieldLabel>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                {...register("password")}
              />
              <FieldError errors={[errors.password]} />
            </Field>

            {serverError && (
              <p className="text-sm text-destructive" role="alert">
                {serverError}
              </p>
            )}

            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? "Signing in..." : "Sign in"}
            </Button>

            <p className="text-center text-xs text-muted-foreground">
              Accounts are created by your chapter admin. Contact an exec if
              you don&apos;t have login credentials.
            </p>
          </FieldGroup>
        </form>
      </div>
    </div>
  );
}
