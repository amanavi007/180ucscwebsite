"use client";

import { useState } from "react";
import { FileText, Loader2 } from "lucide-react";
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

  /** Runs in the background: the dialog closes and a toast (which stays up across pages) shows progress. */
  async function run() {
    const transcript = text;
    const toastId = toast.loading("Reading the transcript…", { description: "You can keep using the site. We'll tell you when it's done.", duration: Infinity });
    setBusy(true);
    setOpen(false);
    setError(null);
    const result = await importInterviewTranscriptAction({ sessionId, transcript });
    setBusy(false);
    if (result.error || !result.notes) {
      const message = result.error ?? "The transcript couldn't be read.";
      setError(message);
      toast.error(message, {
        id: toastId,
        description: undefined,
        duration: 15000,
        action: { label: "Try again", onClick: () => setOpen(true) },
      });
      return;
    }
    onImported(result.notes);
    setText("");
    toast.success(`Filled ${result.filled ?? 0} ${result.filled === 1 ? "box" : "boxes"} from the transcript. Your own notes are untouched.`, {
      id: toastId,
      description: undefined,
      duration: 6000,
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" disabled={busy} />}>
        {busy ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <FileText />} {busy ? "Reading transcript…" : imported ? "Import again" : "Import transcript"}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import a transcript</DialogTitle>
          <DialogDescription>
            Optional. Copy the transcript from Fathom (or any recording tool) and paste it here. What the applicant said fills a separate &ldquo;From the transcript&rdquo;
            block under each note box. Your own notes are never changed, and the transcript itself isn&apos;t saved. It reads in the background, so you can keep using the site.
          </DialogDescription>
        </DialogHeader>
        <label htmlFor="transcript-text" className="sr-only">
          Transcript
        </label>
        <Textarea
          id="transcript-text"
          rows={10}
          className="field-sizing-fixed max-h-[45vh] overflow-y-auto"
          value={text}
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
          <Button disabled={text.trim().length === 0} onClick={run}>
            Fill from transcript
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
