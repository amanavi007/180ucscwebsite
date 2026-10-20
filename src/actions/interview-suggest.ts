"use server";

import { APICallError, generateText, Output } from "ai";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/data/profile";
import { isExec } from "@/lib/auth/roles";
import { buildModel } from "@/lib/assistant/provider";
import { buildSuggestPrompt, cleanSuggestions, suggestOutputSchema, type QuestionSuggestion } from "@/lib/interview-suggest";

export interface SuggestResult {
  error?: string;
  suggestions?: QuestionSuggestion[];
}

/** Reads the applicant's written answers and suggests which behavioral questions are worth asking them. Nothing is saved. */
export async function suggestInterviewQuestionsAction(input: { sessionId: string }): Promise<SuggestResult> {
  const profile = await getCurrentProfile();
  if (!isExec(profile.role)) return { error: "Only exec can do that." };

  const supabase = await createClient();
  const { data: session, error: readError } = await supabase.from("interview_sessions").select("applicant_id").eq("id", input.sessionId).maybeSingle();
  if (readError) return { error: readError.message };
  if (!session?.applicant_id) return { error: "That interview has no applicant attached." };

  const { data: answers, error: answersError } = await supabase
    .from("recruit_applicant_answers")
    .select("essay_why, essay_teamwork, essay_bring")
    .eq("applicant_id", session.applicant_id)
    .maybeSingle();
  if (answersError) return { error: answersError.message };
  const essays = [
    { label: "Why 180?", text: answers?.essay_why ?? "" },
    { label: "Teamwork", text: answers?.essay_teamwork ?? "" },
    { label: "What they bring", text: answers?.essay_bring ?? "" },
  ].filter((e) => e.text.trim() !== "");
  if (essays.length === 0) return { error: "No application answers were imported for this applicant." };

  // Applicants' words go to the model, so use BayLeaf (UCSC, zero data retention) when it is set up.
  const model = buildModel({ ...process.env, ASSISTANT_PRIMARY: "bayleaf" });
  if (!model) return { error: "The AI helper isn't set up yet. Ask an exec to add an AI key." };

  try {
    const { output } = await generateText({ model, output: Output.object({ schema: suggestOutputSchema }), prompt: buildSuggestPrompt(essays) });
    return { suggestions: cleanSuggestions(output) };
  } catch (err) {
    console.error("interview question suggestions failed:", err instanceof Error ? err.message : err);
    if (APICallError.isInstance(err) && (err.statusCode === 429 || (err.statusCode ?? 0) >= 500)) {
      return { error: "The AI provider is busy right now. Try again in a minute." };
    }
    if (APICallError.isInstance(err) && (err.statusCode === 401 || err.statusCode === 403)) {
      return { error: "The AI key was rejected. Ask an exec to check the AI key in the site settings." };
    }
    return { error: "The suggestions couldn't be made. Pick the questions by hand." };
  }
}
