"use client";

import { useState } from "react";
import { FileText } from "lucide-react";
import { toast } from "sonner";
import { importInterviewTranscriptAction } from "@/actions/interview-transcript";
import { TRANSCRIPT_MAX_CHARS } from "@/lib/interview-transcript";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

/** Optional: paste a Fathom (or any) transcript and the "from transcript" blocks under each note box fill in. */
export function TranscriptImport({
  sessionId,
  imported,
  onImported,
}: {
  sessionId: string;
  /** Whether a transcript has been imported before, so the button can say so. */
  imported: boolean;
  onImported: (notes: Record<string, string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    const result = await importInterviewTranscriptAction({ sessionId, transcript: text });
    setBusy(false);
    if (result.error || !result.notes) {
      setError(result.error ?? "The transcript couldn't be read.");
      return;
    }
    onImported(result.notes);
    setText("");
    setOpen(false);
    toast.success(`Filled ${result.filled ?? 0} ${result.filled === 1 ? "box" : "boxes"} from the transcript. Your own notes are untouched.`);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <FileText /> {imported ? "Import again" : "Import transcript"}
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import a transcript</DialogTitle>
          <DialogDescription>
            Optional. Copy the transcript from Fathom (or any recording tool) and paste it here. What the applicant said fills a separate &ldquo;From the transcript&rdquo;
            block under each note box. Your own notes are never changed, and the transcript itself isn&apos;t saved.
          </DialogDescription>
        </DialogHeader>
        <label htmlFor="transcript-text" className="sr-only">
          Transcript
        </label>
        <Textarea
          id="transcript-text"
          rows={14}
          value={text}
          disabled={busy}
          maxLength={TRANSCRIPT_MAX_CHARS}
          placeholder="Paste the whole transcript here, with speaker names if it has them."
          onChange={(e) => setText(e.target.value)}
        />
        {imported && <p className="text-[13px] text-muted-foreground">Importing again replaces the earlier transcript notes.</p>}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button disabled={busy || text.trim().length === 0} onClick={run}>
            {busy ? "Reading the transcript…" : "Fill from transcript"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
