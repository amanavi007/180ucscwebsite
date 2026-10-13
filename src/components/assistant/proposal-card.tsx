"use client";

import { useState } from "react";
import { TriangleAlert } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type State = { kind: "idle" } | { kind: "busy" } | { kind: "done"; text: string } | { kind: "error"; text: string };

/**
 * Approve/Reject for one stored proposal. Both buttons lock on first click so a double-click can't
 * double-run. Irreversible actions (`warning` set) ask "are you sure?" in a popup before running.
 */
export function ProposalCard({ proposalId, preview, warning }: { proposalId: string; preview: string; warning?: string }) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function decide(decision: "approve" | "reject") {
    setConfirmOpen(false);
    setState({ kind: "busy" });
    try {
      const res = await fetch("/api/chat/approve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: proposalId, decision }),
      });
      const body = (await res.json()) as { ok: boolean; error?: string };
      if (body.ok) setState({ kind: "done", text: decision === "approve" ? "Done." : "Dismissed." });
      else setState({ kind: "error", text: body.error ?? "That didn't work." });
    } catch {
      setState({ kind: "error", text: "Network problem. Check the page before trying again." });
    }
  }

  const busy = state.kind === "busy";
  return (
    <Card className={cn("my-2", warning ? "border-destructive/40 bg-destructive/5" : "border-link/30 bg-accent")}>
      <CardContent className="space-y-3 py-3">
        <div className="flex items-start gap-2">
          {warning && <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />}
          <p className="text-sm font-medium">{preview}</p>
        </div>
        {state.kind === "done" || state.kind === "error" ? (
          <p className={state.kind === "error" ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
            {state.text}
          </p>
        ) : (
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={warning ? "destructive" : "default"}
              disabled={busy}
              onClick={() => (warning ? setConfirmOpen(true) : decide("approve"))}
            >
              {warning ? "Approve…" : "Approve"}
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => decide("reject")}>
              Reject
            </Button>
          </div>
        )}
      </CardContent>
      {warning && (
        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you sure?</AlertDialogTitle>
              <AlertDialogDescription>
                {preview}
                <span className="mt-2 block font-medium text-destructive">{warning}</span>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={() => decide("approve")}>
                Yes, do it
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </Card>
  );
}
