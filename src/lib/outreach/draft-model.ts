import "server-only";
import { generateText, Output } from "ai";
import { buildModel } from "@/lib/assistant/provider";
import { CLUB_FACTS } from "./club-facts";
import { draftModelSchema, generateDraft, type DraftKind, type DraftOutput } from "./draft";
import type { ProspectDraftRow } from "./types";

/** A prompt-in, JSON-out function backed by the portal's AI providers (Google first, Groq as the fallback). */
export function modelGenerate(env: Record<string, string | undefined> = process.env): (prompt: string) => Promise<unknown> {
  // BayLeaf is left out: on real draft prompts (about 9,000 characters, structured output) it hangs past 100 seconds, so
  // every draft timed out, and the fallback only triggers on 429/5xx, never on a hang. Google answers in about 5 seconds
  // and Groq in about 4, so drafts use those two (primary, then fallback).
  const { BAYLEAF_API_KEY: _skipBayleaf, ...withoutBayleaf } = env;
  const model = buildModel({ ...withoutBayleaf, ASSISTANT_PRIMARY: undefined });
  if (!model) throw new Error("The AI helper isn't set up. Add an AI key.");
  return async (prompt) => {
    const { output } = await generateText({
      model,
      output: Output.object({ schema: draftModelSchema }),
      prompt,
      // One hanging provider call must not stall the whole prepare run against the cron's time
      // limit: abort the single call, and the runner skips just that company and carries on.
      abortSignal: AbortSignal.timeout(60_000),
    });
    return output;
  };
}

export function draftWithModel(args: {
  row: ProspectDraftRow;
  step: DraftKind;
  previousSubjects: string[];
  generate?: (prompt: string) => Promise<unknown>;
}): Promise<{ draft: DraftOutput } | { needsAttention: string }> {
  return generateDraft({ ...args, clubFacts: CLUB_FACTS, generate: args.generate ?? modelGenerate() });
}
