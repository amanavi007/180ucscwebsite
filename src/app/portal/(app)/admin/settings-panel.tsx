"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updateAttendanceAlertThreshold, updateDefaultBulkPassword, updateResearchPrompts } from "@/actions/org-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import {
  DEFAULT_RESEARCH_PROMPTS,
  RESEARCH_PROMPT_LIMIT,
  RESEARCH_PROMPT_TEXT_MAX,
  RESEARCH_PROMPT_TITLE_MAX,
  type ResearchPrompt,
} from "@/lib/interview-guide";

export function SettingsPanel({
  attendanceThreshold,
  defaultPassword,
  researchPrompts,
}: {
  attendanceThreshold: number;
  defaultPassword: string;
  researchPrompts: ResearchPrompt[];
}) {
  const [thresholdValue, setThresholdValue] = useState(String(Math.round(attendanceThreshold * 100)));
  const [isPendingThreshold, startThresholdTransition] = useTransition();

  const [passwordValue, setPasswordValue] = useState(defaultPassword);
  const [isPendingPassword, startPasswordTransition] = useTransition();

  const [prompts, setPrompts] = useState(researchPrompts);
  const [isPendingPrompts, startPromptsTransition] = useTransition();

  function editPrompt(key: string, patch: Partial<ResearchPrompt>) {
    setPrompts((list) => list.map((p) => (p.key === key ? { ...p, ...patch } : p)));
  }

  function addPrompt() {
    setPrompts((list) => [...list, { key: `custom-${Date.now().toString(36)}`, title: "", text: "" }]);
  }

  function onSavePrompts() {
    startPromptsTransition(async () => {
      const result = await updateResearchPrompts(prompts);
      if (result?.error) toast.error(result.error);
      else toast.success("Research prompts updated.");
    });
  }

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
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Interview research prompts</CardTitle>
          <CardDescription>
            The topics candidates can choose from. Interviewers see these in the research part of the interview.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {prompts.map((p, i) => (
            <div key={p.key} className="space-y-2 rounded-lg border p-3">
              <Field>
                <FieldLabel htmlFor={`prompt-title-${p.key}`}>Title {i + 1}</FieldLabel>
                <Input
                  id={`prompt-title-${p.key}`}
                  value={p.title}
                  maxLength={RESEARCH_PROMPT_TITLE_MAX}
                  onChange={(e) => editPrompt(p.key, { title: e.target.value })}
                  disabled={isPendingPrompts}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`prompt-text-${p.key}`}>Prompt text</FieldLabel>
                <Textarea
                  id={`prompt-text-${p.key}`}
                  rows={4}
                  value={p.text}
                  maxLength={RESEARCH_PROMPT_TEXT_MAX}
                  onChange={(e) => editPrompt(p.key, { text: e.target.value })}
                  disabled={isPendingPrompts}
                />
              </Field>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPrompts((list) => list.filter((x) => x.key !== p.key))}
                disabled={isPendingPrompts || prompts.length <= 1}
              >
                Remove
              </Button>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button onClick={onSavePrompts} disabled={isPendingPrompts}>
              Save
            </Button>
            <Button variant="outline" onClick={addPrompt} disabled={isPendingPrompts || prompts.length >= RESEARCH_PROMPT_LIMIT}>
              Add a prompt
            </Button>
            <Button variant="ghost" onClick={() => setPrompts(DEFAULT_RESEARCH_PROMPTS)} disabled={isPendingPrompts}>
              Reset to the standard five
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
