"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type State = { kind: "idle" } | { kind: "busy" } | { kind: "done"; text: string } | { kind: "error"; text: string };

/** Approve/Reject for one stored proposal. Both buttons lock on first click so a double-click can't double-run. */
export function ProposalCard({ proposalId, preview }: { proposalId: string; preview: string }) {
  const [state, setState] = useState<State>({ kind: "idle" });

  async function decide(decision: "approve" | "reject") {
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

  return (
    <Card className="my-2 border-primary/30 bg-accent">
      <CardContent className="space-y-3 py-3">
        <p className="text-sm font-medium">{preview}</p>
        {state.kind === "done" || state.kind === "error" ? (
          <p className={state.kind === "error" ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
            {state.text}
          </p>
        ) : (
          <div className="flex gap-2">
            <Button size="sm" disabled={state.kind === "busy"} onClick={() => decide("approve")}>
              Approve
            </Button>
            <Button size="sm" variant="outline" disabled={state.kind === "busy"} onClick={() => decide("reject")}>
              Reject
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
