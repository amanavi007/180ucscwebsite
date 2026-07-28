"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updateAttendanceAlertThreshold } from "@/actions/org-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";

export function SettingsPanel({ attendanceThreshold }: { attendanceThreshold: number }) {
  const [value, setValue] = useState(String(Math.round(attendanceThreshold * 100)));
  const [isPending, startTransition] = useTransition();

  function onSave() {
    startTransition(async () => {
      const result = await updateAttendanceAlertThreshold(Number(value));
      if (result?.error) toast.error(result.error);
      else toast.success("Attendance alert threshold updated.");
    });
  }

  return (
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
              value={value}
              onChange={(e) => setValue(e.target.value)}
              disabled={isPending}
            />
            <Button onClick={onSave} disabled={isPending}>
              Save
            </Button>
          </div>
        </Field>
      </CardContent>
    </Card>
  );
}
