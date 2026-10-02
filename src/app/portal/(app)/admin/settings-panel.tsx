"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updateAttendanceAlertThreshold, updateDefaultBulkPassword } from "@/actions/org-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";

export function SettingsPanel({
  attendanceThreshold,
  defaultPassword,
}: {
  attendanceThreshold: number;
  defaultPassword: string;
}) {
  const [thresholdValue, setThresholdValue] = useState(String(Math.round(attendanceThreshold * 100)));
  const [isPendingThreshold, startThresholdTransition] = useTransition();

  const [passwordValue, setPasswordValue] = useState(defaultPassword);
  const [isPendingPassword, startPasswordTransition] = useTransition();

  function onSaveThreshold() {
    startThresholdTransition(async () => {
      const result = await updateAttendanceAlertThreshold(Number(thresholdValue));
      if (result?.error) toast.error(result.error);
      else toast.success("Attendance alert threshold updated.");
    });
  }

  function onSavePassword() {
    startPasswordTransition(async () => {
      const result = await updateDefaultBulkPassword(passwordValue);
      if (result?.error) toast.error(result.error);
      else toast.success("Default password updated.");
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Attendance alert threshold</CardTitle>
          <CardDescription>
            Members below this attendance rate are flagged on the Directory and exec dashboard.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Field className="max-w-xs">
            <FieldLabel htmlFor="threshold">Threshold (%)</FieldLabel>
            <div className="flex gap-2">
              <Input
                id="threshold"
                type="number"
                min={0}
                max={100}
                value={thresholdValue}
                onChange={(e) => setThresholdValue(e.target.value)}
                disabled={isPendingThreshold}
              />
              <Button onClick={onSaveThreshold} disabled={isPendingThreshold}>
                Save
              </Button>
            </div>
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Default account password</CardTitle>
          <CardDescription>
            The shared temp password new accounts (and any password reset) get before they&apos;re
            forced to set their own on next login.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Field className="max-w-xs">
            <FieldLabel htmlFor="default-password">Password</FieldLabel>
            <div className="flex gap-2">
              <Input
                id="default-password"
                type="password"
                autoComplete="new-password"
                value={passwordValue}
                onChange={(e) => setPasswordValue(e.target.value)}
                disabled={isPendingPassword}
              />
              <Button onClick={onSavePassword} disabled={isPendingPassword}>
                Save
              </Button>
            </div>
          </Field>
        </CardContent>
      </Card>
    </div>
  );
}
