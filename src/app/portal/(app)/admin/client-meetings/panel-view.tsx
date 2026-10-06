"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { setClientMeetingPanelAction } from "@/actions/client-meeting";
import { PANEL_SIZE } from "@/lib/client-meeting";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function PanelView({
  execOptions,
  panelExecIds,
}: {
  execOptions: { id: string; name: string }[];
  panelExecIds: string[];
}) {
  const [isPending, startTransition] = useTransition();
  const [picks, setPicks] = useState<string[]>(() =>
    Array.from({ length: PANEL_SIZE }, (_, i) => panelExecIds[i] ?? ""),
  );
  const router = useRouter();

  function setPick(index: number, value: string) {
    setPicks((current) => current.map((p, i) => (i === index ? value : p)));
  }

  function handleSave() {
    if (picks.some((p) => !p)) {
      toast.error(`Pick ${PANEL_SIZE} execs.`);
      return;
    }
    if (new Set(picks).size !== picks.length) {
      toast.error("Each panel member must be a different exec.");
      return;
    }
    startTransition(async () => {
      const result = await setClientMeetingPanelAction(picks);
      if (result.error) toast.error(result.error);
      else toast.success("Panel saved.");
      router.refresh();
    });
  }

  return (
    <Card className="mt-4 max-w-xl">
      <CardHeader>
        <CardTitle className="text-base">Client meeting panel</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {picks.map((pick, i) => (
          <select
            key={i}
            aria-label={`Panel member ${i + 1}`}
            value={pick}
            onChange={(e) => setPick(i, e.target.value)}
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <option value="">Select an exec…</option>
            {execOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        ))}
        <p className="text-xs text-muted-foreground">Changing the panel doesn&apos;t affect meetings already booked.</p>
        <Button onClick={handleSave} disabled={isPending}>
          Save panel
        </Button>
      </CardContent>
    </Card>
  );
}
