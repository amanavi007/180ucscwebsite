"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updateOutreachSettingsAction } from "@/actions/outreach";
import { useConfirm } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { OutreachMode, OutreachSettings } from "@/lib/outreach/settings";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { key: "sending", label: "Sending" },
  { key: "pace", label: "Pace" },
  { key: "sequence", label: "Follow-ups" },
  { key: "sender", label: "Sender" },
] as const;

const MODES: { value: OutreachMode; label: string; description: string }[] = [
  { value: "off", label: "Off", description: "Nothing is drafted or sent." },
  { value: "dry_run", label: "Test drafts", description: "Drafts are written so you can read them. Nothing is sent." },
  { value: "self_only", label: "Send to me only", description: "Emails go only to your inbox (the person who saves this), not to prospects or the other execs. Use this to test without spamming everyone." },
  { value: "exec_only", label: "Send to execs only", description: "Emails go to the execs' inboxes, not to prospects, so you can check how they look and arrive." },
  { value: "live", label: "Live", description: "Emails go to prospects, slowly, within the daily limit." },
];

/** Outreach settings: sections on the left, one at a time on the right, saved together with one button. */
export function SettingsForm({ settings }: { settings: OutreachSettings }) {
  const [section, setSection] = useState<(typeof SECTIONS)[number]["key"]>("sending");
  const [mode, setMode] = useState<OutreachMode>(settings.mode);
  const [paused, setPaused] = useState(settings.paused);
  const [dailyCap, setDailyCap] = useState(settings.dailyCapOverride === null ? "" : String(settings.dailyCapOverride));
  const [startHour, setStartHour] = useState(String(settings.windowStartHour));
  const [endHour, setEndHour] = useState(String(settings.windowEndHour));
  const [followups, setFollowups] = useState(settings.followupDays.join(", "));
  const [senderName, setSenderName] = useState(settings.senderName);
  const [fromName, setFromName] = useState(settings.fromName);
  const [signature, setSignature] = useState(settings.signature);
  const [address, setAddress] = useState(settings.postalAddress);
  const [isPending, startTransition] = useTransition();
  const [confirm, confirmDialog] = useConfirm();

  async function onSave() {
    if (mode === "live" && settings.mode !== "live") {
      const ok = await confirm({
        title: "Start emailing real prospects?",
        description: "Emails will go to companies from the team address, a few a day. You can pause at any time.",
        confirmLabel: "Go live",
        cancelLabel: "Not yet",
      });
      if (!ok) return;
    }
    startTransition(async () => {
      const result = await updateOutreachSettingsAction({
        mode,
        paused,
        dailyCapOverride: dailyCap,
        windowStartHour: startHour,
        windowEndHour: endHour,
        senderName,
        fromName,
        signature,
        postalAddress: address,
        followupDays: followups,
      });
      if (result.error) toast.error(result.error);
      else toast.success("Outreach settings saved.");
    });
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[200px_minmax(0,1fr)]">
      <nav aria-label="Settings sections" className="flex gap-1.5 lg:flex-col">
        {SECTIONS.map((s) => (
          <button
            key={s.key}
            type="button"
            aria-current={section === s.key ? "page" : undefined}
            onClick={() => setSection(s.key)}
            className={cn(
              "rounded-[10px] px-3.5 py-2 text-left text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring",
              section === s.key ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {s.label}
          </button>
        ))}
      </nav>

      <div className="space-y-6 rounded-[22px] border bg-card p-6">
        {section === "sending" && (
          <>
            <fieldset className="space-y-3">
              <legend className="text-lg">Mode</legend>
              {MODES.map((m) => (
                <label key={m.value} className="flex cursor-pointer items-start gap-3 rounded-2xl border p-3.5 has-[:checked]:bg-accent">
                  <input type="radio" name="outreach-mode" value={m.value} checked={mode === m.value} onChange={() => setMode(m.value)} className="mt-1" />
                  <span>
                    <span className="block font-semibold">{m.label}</span>
                    <span className="block text-sm text-muted-foreground">{m.description}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            <label className="flex items-start gap-3">
              <Checkbox checked={paused} onCheckedChange={(v) => setPaused(v === true)} className="mt-0.5" />
              <span>
                <span className="block font-semibold">Pause sending</span>
                <span className="block text-sm text-muted-foreground">
                  Stops new emails right away. Sending also pauses itself if too many emails bounce or someone reports spam. Turn this off to resume.
                </span>
              </span>
            </label>
          </>
        )}

        {section === "pace" && (
          <>
            <h2 className="text-lg">Pace</h2>
            <Field className="max-w-xs">
              <FieldLabel htmlFor="outreach-cap">Daily limit</FieldLabel>
              <Input id="outreach-cap" inputMode="numeric" value={dailyCap} onChange={(e) => setDailyCap(e.target.value)} placeholder="Automatic" />
              <FieldDescription>Leave empty for the automatic ramp: 15 a day for the first five days, then 5 more each day up to 40. A number here overrides it (never above 100).</FieldDescription>
            </Field>
            <div className="flex flex-wrap gap-4">
              <Field className="w-40">
                <FieldLabel htmlFor="outreach-start">Send from (hour)</FieldLabel>
                <Input id="outreach-start" inputMode="numeric" value={startHour} onChange={(e) => setStartHour(e.target.value)} />
              </Field>
              <Field className="w-40">
                <FieldLabel htmlFor="outreach-end">Send until (hour)</FieldLabel>
                <Input id="outreach-end" inputMode="numeric" value={endHour} onChange={(e) => setEndHour(e.target.value)} />
              </Field>
            </div>
            <p className="text-sm text-muted-foreground">Hours are 0 to 23 in Santa Cruz time (9 and 16 means 9am to 4pm). Emails only go out on weekdays, spread across the window.</p>
          </>
        )}

        {section === "sequence" && (
          <>
            <h2 className="text-lg">Follow-ups</h2>
            <Field className="max-w-xs">
              <FieldLabel htmlFor="outreach-followups">Business days after the first email</FieldLabel>
              <Input id="outreach-followups" value={followups} onChange={(e) => setFollowups(e.target.value)} />
              <FieldDescription>Rising whole numbers. 4, 9, 15 means a follow-up on day 4, another on day 9 and a short closing note on day 15. Replies, bookings and opt-outs stop the sequence.</FieldDescription>
            </Field>
          </>
        )}

        {section === "sender" && (
          <>
            <h2 className="text-lg">Sender</h2>
            <Field className="max-w-md">
              <FieldLabel htmlFor="outreach-name">Sender name</FieldLabel>
              <Input id="outreach-name" value={senderName} onChange={(e) => setSenderName(e.target.value)} />
              <FieldDescription>Shown at the bottom of every email. The address emails come from is set in the environment, not here.</FieldDescription>
            </Field>
            <Field className="max-w-md">
              <FieldLabel htmlFor="outreach-from-name">Sent by (full name)</FieldLabel>
              <Input id="outreach-from-name" value={fromName} placeholder="Aman Avinash" onChange={(e) => setFromName(e.target.value)} />
              <FieldDescription>The name people see as the sender. The email address uses the first name, so &quot;Aman Avinash&quot; sends from aman@ on the outreach domain. Leave empty to send as the team.</FieldDescription>
            </Field>
            <Field className="max-w-md">
              <FieldLabel htmlFor="outreach-signature">Signature</FieldLabel>
              <Textarea id="outreach-signature" value={signature} rows={6} placeholder={"Best regards,\n\nAman Avinash\nDirector of Projects | 180 Degrees Consulting"} onChange={(e) => setSignature(e.target.value)} />
              <FieldDescription>Everything after the message, starting with the closing line. Write a link as [Learn more](https://ucsc180dc.org) and it shows as a clickable word. Leave empty to sign as the team.</FieldDescription>
            </Field>
            <Field className="max-w-md">
              <FieldLabel htmlFor="outreach-address">Postal address</FieldLabel>
              <Input id="outreach-address" value={address} onChange={(e) => setAddress(e.target.value)} />
              <FieldDescription>Required by law in every commercial email. Use a real street address.</FieldDescription>
            </Field>
          </>
        )}

        <div className="border-t pt-5">
          <Button size="lg" onClick={onSave} disabled={isPending}>
            Save settings
          </Button>
        </div>
      </div>
      {confirmDialog}
    </div>
  );
}
