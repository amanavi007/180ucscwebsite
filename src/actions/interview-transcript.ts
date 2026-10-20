"use server";

import { APICallError, generateText, Output } from "ai";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/data/profile";
import { isExec } from "@/lib/auth/roles";
import { buildModel } from "@/lib/assistant/provider";
import {
  TRANSCRIPT_MAX_CHARS,
  TRANSCRIPT_MIN_CHARS,
  buildTranscriptPrompt,
  transcriptNotePatch,
  transcriptOutputSchema,
} from "@/lib/interview-transcript";

export interface TranscriptImportResult {
  error?: string;
  /** The transcript-filled notes that were saved, so the page can show them right away. */
  notes?: Record<string, string>;
}

/**
 * Fills the "from transcript" notes of an interview from a pasted transcript. The exec's own notes are never touched.
 * The transcript itself is not stored: only the short notes the model pulls out of it.
 */
export async function importInterviewTranscriptAction(input: { sessionId: string; transcript: string }): Promise<TranscriptImportResult> {
  const profile = await getCurrentProfile();
  if (!isExec(profile.role)) return { error: "Only exec can do that." };

  const transcript = input.transcript.trim();
  if (transcript.length < TRANSCRIPT_MIN_CHARS) return { error: "That looks too short to be a whole interview. Paste the full transcript." };
  if (transcript.length > TRANSCRIPT_MAX_CHARS) return { error: "That transcript is too long. Paste just the interview part." };

  const supabase = await createClient();
  const { data: session, error: readError } = await supabase
    .from("interview_sessions")
    .select("behavioral_keys, case_key")
    .eq("id", input.sessionId)
    .maybeSingle();
  if (readError) return { error: readError.message };
  if (!session) return { error: "That interview is gone. Refresh the page." };
  const plan = { behavioralKeys: session.behavioral_keys ?? [], caseKey: session.case_key };

  // Candidates' words go to the model, so use BayLeaf (UCSC, zero data retention) when it is set up.
  const model = buildModel({ ...process.env, ASSISTANT_PRIMARY: "bayleaf" });
  if (!model) return { error: "The AI helper isn't set up yet. Ask an exec to add an AI key." };

  let patch: Record<string, string>;
  try {
    const { output } = await generateText({
      model,
      output: Output.object({ schema: transcriptOutputSchema }),
      prompt: buildTranscriptPrompt(transcript, plan),
    });
    patch = transcriptNotePatch(output, plan, new Date().toISOString());
  } catch (err) {
    console.error("interview transcript import failed:", err instanceof Error ? err.message : err);
    if (APICallError.isInstance(err) && (err.statusCode === 429 || (err.statusCode ?? 0) >= 500)) {
      return { error: "The AI provider is busy right now. Try again in a minute." };
    }
    return { error: "The transcript couldn't be read. Try again, or fill the notes by hand." };
  }

  const { error: rpcError } = await supabase.rpc("merge_interview_notes", { p_session: input.sessionId, p_patch: patch });
  if (rpcError) return { error: rpcError.message };
  return { notes: patch };
}
