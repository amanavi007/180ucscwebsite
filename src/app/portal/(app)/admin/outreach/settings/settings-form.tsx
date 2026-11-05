"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { generateAgentKeyAction, revokeAgentKeyAction, setAgentKeyAuditAction, setAgentKeyCorrectAction, updateOutreachSettingsAction } from "@/actions/outreach";
import { useConfirm } from "@/components/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { OutreachMode, OutreachSettings } from "@/lib/outreach/settings";
import { cleanLinkedin, mailboxName, type OutreachSender } from "@/lib/outreach/senders";
import type { AgentOverview } from "@/lib/data/outreach-agent";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { key: "sending", label: "Sending" },
  { key: "discovery", label: "Discovery" },
  { key: "agent", label: "Research agent" },
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

function when(iso: string | null): string {
  if (!iso) return "never";
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

/** Outreach settings: sections on the left, one at a time on the right, saved together with one button. */
export function SettingsForm({ settings, agent, roster }: { settings: OutreachSettings; agent: AgentOverview; roster: OutreachSender[] }) {
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
  // Until officers are saved, the execs on the roster are shown as a starting point. Saving makes them the senders.
  const [senders, setSenders] = useState<OutreachSender[]>(settings.senders.length > 0 ? settings.senders : roster);
  const [address, setAddress] = useState(settings.postalAddress);
  const [discoveryOn, setDiscoveryOn] = useState(settings.discoveryEnabled);
  const [perDay, setPerDay] = useState(String(settings.discoveryPerDay));
  const [maxTeam, setMaxTeam] = useState(String(settings.discoveryMaxTeam));
  const [regions, setRegions] = useState(settings.discoveryRegions.join(", "));
  const [industries, setIndustries] = useState(settings.discoveryIndustries.join("; "));
  const [agentOn, setAgentOn] = useState(settings.agentEnabled);
  const [agentPerDay, setAgentPerDay] = useState(String(settings.agentDailyTarget));
  const [agentTargets, setAgentTargets] = useState(JSON.stringify(settings.agentTargets, null, 2));
  const [keyLabel, setKeyLabel] = useState("Muse");
  const [keyAudit, setKeyAudit] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
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
        senders,
        postalAddress: address,
        followupDays: followups,
        discoveryEnabled: discoveryOn,
        discoveryPerDay: perDay,
        discoveryMaxTeam: maxTeam,
        discoveryRegions: regions,
        discoveryIndustries: industries,
        agentEnabled: agentOn,
        agentDailyTarget: agentPerDay,
        agentTargets,
      });
      if (result.error) toast.error(result.error);
      else toast.success("Outreach settings saved.");
    });
  }

  const changeSender = (id: string, patch: Partial<OutreachSender>) => setSenders((list) => list.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  function onAddSender() {
    setSenders((list) => [...list, { id: crypto.randomUUID(), name: "", title: "", linkedin: "", enabled: true }]);
  }

  function onFillFromRoster() {
    // Keeps what was edited by hand; only adds execs who are not in the list yet.
    setSenders((list) => [...list, ...roster.filter((r) => !list.some((s) => s.id === r.id))]);
    toast.success("Execs from the roster added.");
  }

  function onGenerateKey() {
    startTransition(async () => {
      const result = await generateAgentKeyAction(keyLabel, keyAudit);
      if (result.error) toast.error(result.error);
      else setNewKey(result.key ?? null);
    });
  }

  function onToggleAudit(id: string, enabled: boolean) {
    startTransition(async () => {
      const result = await setAgentKeyAuditAction(id, enabled);
      if (result.error) toast.error(result.error);
      else toast.success(enabled ? "Audit access on." : "Audit access off.");
    });
  }

  function onToggleCorrect(id: string, enabled: boolean) {
    startTransition(async () => {
      const result = await setAgentKeyCorrectAction(id, enabled);
      if (result.error) toast.error(result.error);
      else toast.success(enabled ? "Correction access on." : "Correction access off.");
    });
  }

  async function onRevokeKey(id: string, label: string) {
    const ok = await confirm({
      title: `Revoke the key "${label}"?`,
      description: "The agent stops working with it right away. This can't be undone.",
      confirmLabel: "Revoke key",
      cancelLabel: "Keep it",
    });
    if (!ok) return;
    startTransition(async () => {
      const result = await revokeAgentKeyAction(id);
      if (result.error) toast.error(result.error);
      else toast.success("Key revoked.");
    });
  }

  async function onCopyKey() {
    try {
      await navigator.clipboard.writeText(newKey ?? "");
      toast.success("Key copied.");
    } catch {
      toast.error("Couldn't copy. Select the key and copy it by hand.");
    }
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

        {section === "discovery" && (
          <>
            <h2 className="text-lg">Discovery</h2>
            <label className="flex items-start gap-3">
              <Checkbox checked={discoveryOn} onCheckedChange={(v) => setDiscoveryOn(v === true)} className="mt-0.5" />
              <span>
                <span className="block font-semibold">Find new companies automatically</span>
                <span className="block text-sm text-muted-foreground">
                  Every morning around 6am it looks for companies that fit, reads their websites and adds the ones that publish an email as new prospects. It never emails anyone itself; sending follows the mode and pace settings.
                </span>
              </span>
            </label>
            <div className="flex flex-wrap gap-4">
              <Field className="w-52">
                <FieldLabel htmlFor="outreach-discovery-per-day">Companies to find per day</FieldLabel>
                <Input id="outreach-discovery-per-day" inputMode="numeric" value={perDay} onChange={(e) => setPerDay(e.target.value)} />
              </Field>
              <Field className="w-52">
                <FieldLabel htmlFor="outreach-discovery-team">Biggest team size</FieldLabel>
                <Input id="outreach-discovery-team" inputMode="numeric" value={maxTeam} onChange={(e) => setMaxTeam(e.target.value)} />
              </Field>
            </div>
            <Field className="max-w-xl">
              <FieldLabel htmlFor="outreach-discovery-regions">Cities</FieldLabel>
              <Input id="outreach-discovery-regions" value={regions} onChange={(e) => setRegions(e.target.value)} />
              <FieldDescription>Separated by commas. A company counts if any of its locations includes one of these.</FieldDescription>
            </Field>
            <Field className="max-w-xl">
              <FieldLabel htmlFor="outreach-discovery-industries">Industries</FieldLabel>
              <Input id="outreach-discovery-industries" value={industries} onChange={(e) => setIndustries(e.target.value)} />
              <FieldDescription>Separated by semicolons, using Y Combinator&apos;s names, for example Healthcare; B2B; Fintech; Infrastructure; Consumer; Security.</FieldDescription>
            </Field>
            <p className="text-sm text-muted-foreground">Discovery pauses by itself while a lot of prospects are still waiting to be sent, so it never gets ahead of the daily limit.</p>
          </>
        )}

        {section === "agent" && (
          <>
            <h2 className="text-lg">Research agent</h2>
            <label className="flex items-start gap-3">
              <Checkbox checked={agentOn} onCheckedChange={(v) => setAgentOn(v === true)} className="mt-0.5" />
              <span>
                <span className="block font-semibold">Let the research agent add prospects</span>
                <span className="block text-sm text-muted-foreground">
                  An outside AI agent researches companies on the web and sends them here with a published email and its source. It can&apos;t send email, change settings or see anything else. New prospects are saved under your name and follow the mode and pace settings.
                </span>
              </span>
            </label>
            <Field className="w-60">
              <FieldLabel htmlFor="outreach-agent-per-day">Prospects to find per day</FieldLabel>
              <Input id="outreach-agent-per-day" inputMode="numeric" value={agentPerDay} onChange={(e) => setAgentPerDay(e.target.value)} />
              <FieldDescription>Whole number, 0 to 100. It stops asking while many prospects are still waiting to be sent.</FieldDescription>
            </Field>
            <Field className="max-w-2xl">
              <FieldLabel htmlFor="outreach-agent-targets">Who to look for</FieldLabel>
              <Textarea id="outreach-agent-targets" value={agentTargets} rows={10} className="font-mono text-sm" onChange={(e) => setAgentTargets(e.target.value)} />
              <FieldDescription>
                One entry per kind of company: segment, regions, size range, share (percent of the daily number) and what they need help with. The agent reads this on every run.
              </FieldDescription>
            </Field>

            <div className="space-y-1.5 border-t pt-5 text-sm">
              <h3 className="text-base font-semibold">Last run</h3>
              <p className="text-muted-foreground">
                Reported {when(agent.lastRunAt)}. Added {agent.acceptedToday} today.
                {agent.topSkips.length > 0 && <> Skipped most often: {agent.topSkips.map((t) => `${t.reason.replace(/_/g, " ")} (${t.count})`).join(", ")}.</>}
              </p>
              {agent.lastError && <p className="break-words">Last error: {agent.lastError}</p>}
              {agent.corrections.length > 0 && (
                <div>
                  <p className="font-semibold text-foreground">Recent audit changes</p>
                  <ul className="max-h-40 space-y-1 overflow-auto">
                    {agent.corrections.map((c, i) => (
                      <li key={`${c.at}-${i}`} className="break-words">
                        {c.company}: {c.summary} <span className="tabular-nums">({when(c.at)})</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="space-y-3 border-t pt-5">
              <h3 className="text-base font-semibold">Keys</h3>
              {agent.keys.length === 0 && <p className="text-sm text-muted-foreground">No keys yet.</p>}
              <ul className="max-h-64 space-y-2 overflow-auto">
                {agent.keys.map((k) => (
                  <li key={k.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-2xl border p-3">
                    <span className="min-w-0 break-words font-semibold">{k.label}</span>
                    <code className="text-sm text-muted-foreground">{k.prefix}…</code>
                    <Badge variant={k.revokedAt ? "muted" : "ok"}>{k.revokedAt ? "Revoked" : "Active"}</Badge>
                    <span className="text-sm text-muted-foreground">read, submit, enrich{k.audit ? ", audit" : ""}{k.correct ? ", correct" : ""}</span>
                    <span className="text-sm text-muted-foreground tabular-nums">last used {when(k.lastUsedAt)}</span>
                    {!k.revokedAt && (
                      <Button variant="outline" size="sm" className="ml-auto" disabled={isPending} onClick={() => onToggleAudit(k.id, !k.audit)}>
                        {k.audit ? "Remove audit access" : "Allow audit access"}
                      </Button>
                    )}
                    {!k.revokedAt && (
                      <Button variant="outline" size="sm" disabled={isPending} onClick={() => onToggleCorrect(k.id, !k.correct)}>
                        {k.correct ? "Remove correction access" : "Allow correction access"}
                      </Button>
                    )}
                    {!k.revokedAt && (
                      <Button variant="outline" size="sm" className="text-destructive" disabled={isPending} onClick={() => onRevokeKey(k.id, k.label)}>
                        Revoke key
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
              {newKey ? (
                <div className="space-y-2 rounded-2xl bg-accent p-4 text-accent-foreground">
                  <p className="font-semibold">Copy this key now. It won&apos;t be shown again.</p>
                  <code className="block max-h-24 overflow-auto break-all rounded-[10px] bg-card p-3 text-sm">{newKey}</code>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={onCopyKey}>
                      Copy key
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setNewKey(null)}>
                      I&apos;ve saved it
                    </Button>
                  </div>
                  <p className="text-sm">Give it to the agent through its secure credential entry, never in chat or email.</p>
                </div>
              ) : (
                <div className="flex flex-wrap items-end gap-3">
                  <Field className="w-56">
                    <FieldLabel htmlFor="outreach-agent-key-label">Key name</FieldLabel>
                    <Input id="outreach-agent-key-label" value={keyLabel} maxLength={60} onChange={(e) => setKeyLabel(e.target.value)} />
                  </Field>
                  <label className="flex max-w-sm items-start gap-2 text-sm">
                    <Checkbox checked={keyAudit} onCheckedChange={(v) => setKeyAudit(v === true)} className="mt-0.5" />
                    <span>Audit access: read all discovery and prospect data, fix a company&apos;s website, add sourced facts, hand a company back to discovery. Never sends, deletes or changes settings.</span>
                  </label>
                  <Button variant="outline" disabled={isPending} onClick={onGenerateKey}>
                    Generate agent key
                  </Button>
                </div>
              )}
              <p className="text-sm text-muted-foreground">Two keys can be active at once, so you can swap keys without a gap: make the new one, give it to the agent, then revoke the old one.</p>
            </div>
          </>
        )}

        {section === "pace" && (
          <>
            <h2 className="text-lg">Pace</h2>
            <Field className="max-w-xs">
              <FieldLabel htmlFor="outreach-cap">Daily limit</FieldLabel>
              <Input id="outreach-cap" inputMode="numeric" value={dailyCap} onChange={(e) => setDailyCap(e.target.value)} placeholder="Automatic" />
              <FieldDescription>Leave empty for the automatic ramp: 5 a day for the first week, 10 for the second, then 2 more each day up to 40. A number here overrides it (never above 100).</FieldDescription>
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
            <fieldset className="space-y-3">
              <legend className="text-base font-semibold">Officers who send</legend>
              <p className="max-w-prose text-sm text-muted-foreground">
                Emails take turns coming from these officers, and each is signed with that officer&apos;s name, title and LinkedIn. A company hears from the same
                officer every time. Replies still go to the shared team inbox. Turn an officer off when they step down.
              </p>
              <div className="max-h-[50dvh] space-y-3 overflow-y-auto pr-1">
                {senders.length === 0 && <p className="text-sm text-muted-foreground">No officers yet. Everything is sent from the sender below. Add officers, or fill the list from the roster.</p>}
                {senders.map((s) => (
                  <div key={s.id} className="min-w-0 space-y-3 rounded-2xl border p-3.5">
                    <div className="flex items-center justify-between gap-3">
                      <label className="flex min-w-0 items-center gap-2.5">
                        <Checkbox checked={s.enabled} onCheckedChange={(v) => changeSender(s.id, { enabled: v === true })} />
                        <span className="min-w-0 truncate font-semibold">{s.name.trim() || "New officer"}</span>
                        <Badge variant={s.enabled ? "ok" : "muted"}>{s.enabled ? "Sending" : "Off"}</Badge>
                      </label>
                      <Button type="button" variant="ghost" size="sm" onClick={() => setSenders((list) => list.filter((x) => x.id !== s.id))}>
                        Remove
                      </Button>
                    </div>
                    <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                      <Field className="min-w-0">
                        <FieldLabel htmlFor={`sender-name-${s.id}`}>Full name</FieldLabel>
                        <Input id={`sender-name-${s.id}`} value={s.name} onChange={(e) => changeSender(s.id, { name: e.target.value })} />
                        <FieldDescription>Sends from {mailboxName(s.name) || "firstname"}@ on the outreach domain.</FieldDescription>
                      </Field>
                      <Field className="min-w-0">
                        <FieldLabel htmlFor={`sender-title-${s.id}`}>Title</FieldLabel>
                        <Input id={`sender-title-${s.id}`} value={s.title} onChange={(e) => changeSender(s.id, { title: e.target.value })} />
                      </Field>
                    </div>
                    <Field className="min-w-0">
                      <FieldLabel htmlFor={`sender-linkedin-${s.id}`}>LinkedIn link</FieldLabel>
                      <Input
                        id={`sender-linkedin-${s.id}`}
                        value={s.linkedin}
                        placeholder="https://www.linkedin.com/in/..."
                        onChange={(e) => changeSender(s.id, { linkedin: e.target.value })}
                        onBlur={(e) => changeSender(s.id, { linkedin: cleanLinkedin(e.target.value) || e.target.value.trim() })}
                      />
                      <FieldDescription>Optional. Leave empty and the signature shows only the website link.</FieldDescription>
                    </Field>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={onAddSender}>
                  Add an officer
                </Button>
                <Button type="button" variant="outline" onClick={onFillFromRoster}>
                  Fill from the roster
                </Button>
              </div>
            </fieldset>
            <h3 className="text-base font-semibold">Single sender</h3>
            <p className="max-w-prose text-sm text-muted-foreground">Used only while no officer above is turned on.</p>
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
