"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { setInterviewWindowAction } from "@/actions/interview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** The dates interviews can happen on. Availability outside it is ignored for interviews; empty means any date. */
export function InterviewWindowForm({ windowStart, windowEnd }: { windowStart: string | null; windowEnd: string | null }) {
  const [start, setStart] = useState(windowStart ?? "");
  const [end, setEnd] = useState(windowEnd ?? "");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const changed = start !== (windowStart ?? "") || end !== (windowEnd ?? "");

  function save() {
    startTransition(async () => {
      const result = await setInterviewWindowAction(start || null, end || null);
      if (result.error) toast.error(result.error);
      else toast.success(start || end ? "Interview dates saved." : "Interviews can use any date.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">Interview dates. Leave empty for any date.</p>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Input type="date" aria-label="Interviews start" className="w-40" value={start} onChange={(e) => setStart(e.target.value)} />
        <span className="text-muted-foreground">to</span>
        <Input type="date" aria-label="Interviews end" className="w-40" value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} />
        <Button variant="outline" size="sm" onClick={save} disabled={isPending || !changed}>
          Save dates
        </Button>
      </div>
    </div>
  );
}
