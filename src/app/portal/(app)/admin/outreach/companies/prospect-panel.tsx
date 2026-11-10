"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { doNotContactAction, loadProspectDetailAction, regenerateDraftAction, resumeProspectAction, stopProspectAction } from "@/actions/outreach";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/confirm-dialog";
import type { ProspectDetail, ProspectView } from "@/lib/data/outreach";
import { eventLabel, formatWhen, replyLabel, stageChip, stepLabel } from "@/lib/outreach/view";

const FINISHED = ["replied", "booked", "unsubscribed", "bounced", "invalid", "no_response", "contacted"];

/** One prospect in a panel beside the list: who they are, what we know, what was sent, what came back. */
export function ProspectPanel({
  prospect,
  onClose,
}: {
  prospect: ProspectView;
  onClose: () => void;
}) {
  // Emails, replies and the timeline are read for this one company when it opens, not shipped for every company with the list.
  const [detail, setDetail] = useState<ProspectDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  // Reload after an action changes the company (a rewrite, a stop, a send).
  const version = `${prospect.status}|${prospect.step}|${prospect.nextActionAt}|${prospect.lastSentAt}`;
  useEffect(() => {
    let cancelled = false;
    loadProspectDetailAction(prospect.id).then((r) => {
      if (cancelled) return;
      if (r.detail) {
        setDetail(r.detail);
        setDetailError(null);
      } else setDetailError(r.error ?? "That company's emails didn't load.");
    });
    return () => {
      cancelled = true;
    };
  }, [prospect.id, version]);
  const loading = !detail && !detailError;
  const messages = detail?.messages ?? [];
  const replies = detail?.replies ?? [];
  const events = detail?.events ?? [];

  const [isPending, startTransition] = useTransition();
  const [confirm, confirmDialog] = useConfirm();
  const chip = stageChip(prospect.status);
  const stopped = prospect.status === "needs_attention" && prospect.statusReason === "Stopped by an exec.";
  const canRewrite = prospect.step === 0 && ["drafted", "needs_attention"].includes(prospect.status);
  const canStop = !FINISHED.includes(prospect.status) && prospect.status !== "needs_attention";

  function run(action: () => Promise<{ error?: string }>, done: string) {
    startTransition(async () => {
      const result = await action();
      if (result.error) toast.error(result.error);
      else toast.success(done);
    });
  }

  async function onStop() {
    const ok = await confirm({
      title: `Stop emailing ${prospect.company}?`,
      description: "Anything scheduled is cancelled and no follow-ups go out. You can resume later.",
      confirmLabel: "Stop the sequence",
    });
    if (ok) run(() => stopProspectAction(prospect.id), `Stopped ${prospect.company}.`);
  }

  async function onDoNotContact() {
    const ok = await confirm({
      title: `Never contact ${prospect.contactEmail} again?`,
      description: "They go on the permanent do-not-contact list and nothing more is sent. This can't be undone from here.",
      confirmLabel: "Never contact them",
    });
    if (ok) run(() => doNotContactAction(prospect.id), `${prospect.contactEmail} will not be contacted again.`);
  }

  return (
    <aside aria-label={prospect.company} className="space-y-6 rounded-[22px] border bg-card p-6 xl:sticky xl:top-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-xl">{prospect.company}</h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <Badge variant={chip.variant}>{chip.label}</Badge>
            {prospect.niche && <Badge variant="muted">{prospect.niche}</Badge>}
          </div>
        </div>
        <Button variant="outline" size="icon-sm" onClick={onClose} aria-label="Close panel">
          ✕
        </Button>
      </div>

      {prospect.statusReason && <p className="rounded-2xl bg-muted p-3 text-sm">{prospect.statusReason}</p>}

      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-2xl bg-muted p-3">
          <dt className="text-muted-foreground">Contact</dt>
          <dd className="mt-0.5 font-semibold">{prospect.contactName ?? "Unknown"}</dd>
          <dd className="text-muted-foreground">{prospect.contactRole ?? ""}</dd>
          <dd className="break-all">{prospect.contactEmail}</dd>
        </div>
        <div className="rounded-2xl bg-muted p-3">
          <dt className="text-muted-foreground">Next step</dt>
          <dd className="mt-0.5 font-semibold tabular-nums">{formatWhen(prospect.nextActionAt)}</dd>
          <dt className="mt-2 text-muted-foreground">Last sent</dt>
          <dd className="mt-0.5 font-semibold tabular-nums">{formatWhen(prospect.lastSentAt)}</dd>
        </div>
      </dl>

      {prospect.website && (
        <p className="text-sm">
          <a href={prospect.website} target="_blank" rel="noreferrer" className="break-all text-link underline-offset-4 hover:underline">
            {prospect.website}
          </a>
          {prospect.sizeStage && <span className="text-muted-foreground"> · {prospect.sizeStage}</span>}
        </p>
      )}

      <section aria-labelledby="facts-heading" className="space-y-2">
        <h3 id="facts-heading" className="text-base">What we know</h3>
        {prospect.facts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No researched facts. Emails can&apos;t be written without them.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {prospect.facts.map((f, i) => (
              <li key={i}>
                {f.text}
                {f.sourceUrl && (
                  <>
                    {" "}
                    <a href={f.sourceUrl} target="_blank" rel="noreferrer" className="text-link underline-offset-4 hover:underline">
                      Source
                    </a>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="messages-heading" className="space-y-3">
        <h3 id="messages-heading" className="text-base">Emails</h3>
        {loading && <p className="text-sm text-muted-foreground">Loading emails…</p>}
        {detailError && <p className="text-sm text-status-bad-foreground">{detailError}</p>}
        {!loading && !detailError && messages.length === 0 && <p className="text-sm text-muted-foreground">No emails written yet.</p>}
        {messages.map((m) => (
          <article key={m.id} className="space-y-1.5 rounded-2xl border p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-semibold">{stepLabel(m.step)}</span>
              <Badge variant={m.status === "sent" ? "ok" : m.status === "failed" ? "bad" : m.status === "cancelled" ? "muted" : "info"}>
                {m.status === "scheduled" ? `Scheduled ${formatWhen(m.scheduledFor)}` : m.status === "sent" ? `Sent ${formatWhen(m.sentAt)}` : m.status === "draft" ? "Draft" : m.status === "failed" ? "Failed" : "Cancelled"}
              </Badge>
            </div>
            <p className="text-sm font-semibold">{m.subject}</p>
            <p className="max-w-[66ch] text-sm whitespace-pre-wrap text-muted-foreground">{m.bodyText}</p>
            {m.error && <p className="text-sm text-status-bad-foreground">{m.error}</p>}
          </article>
        ))}
      </section>

      {replies.length > 0 && (
        <section aria-labelledby="replies-heading" className="space-y-3">
          <h3 id="replies-heading" className="text-base">Replies</h3>
          {replies.map((r) => (
            <article key={r.id} className="space-y-1.5 rounded-2xl border p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-semibold">{r.fromEmail}</span>
                <Badge variant="warn">{replyLabel(r.classification)}</Badge>
              </div>
              <p className="text-sm whitespace-pre-wrap text-muted-foreground">{r.snippet}</p>
              <p className="text-xs text-muted-foreground">Forwarded to all execs · {formatWhen(r.createdAt)}</p>
            </article>
          ))}
        </section>
      )}

      {events.length > 0 && (
        <section aria-labelledby="timeline-heading" className="space-y-2">
          <h3 id="timeline-heading" className="text-base">Timeline</h3>
          <ul className="space-y-1 text-sm">
            {events.map((e) => (
              <li key={e.id} className="flex justify-between gap-3">
                <span>{eventLabel(e.kind)}</span>
                <span className="text-muted-foreground tabular-nums">{formatWhen(e.createdAt)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="space-y-3 border-t pt-5">
        <div className="flex flex-wrap gap-2">
          {canRewrite && (
            <Button variant="outline" disabled={isPending} onClick={() => run(() => regenerateDraftAction(prospect.id), "A new draft will be written at the next run, or press Generate drafts.")}>
              Rewrite the draft
            </Button>
          )}
          {canStop && (
            <Button variant="outline" disabled={isPending} onClick={onStop}>
              Stop the sequence
            </Button>
          )}
          {stopped && (
            <Button variant="outline" disabled={isPending} onClick={() => run(() => resumeProspectAction(prospect.id), `${prospect.company} will pick up again.`)}>
              Resume the sequence
            </Button>
          )}
        </div>
        {prospect.status !== "unsubscribed" && (
          <Button variant="destructive" disabled={isPending} onClick={onDoNotContact}>
            Never contact them
          </Button>
        )}
      </div>
      {confirmDialog}
    </aside>
  );
}
