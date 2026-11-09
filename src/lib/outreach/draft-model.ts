import "server-only";
import { generateText, Output } from "ai";
import { buildModel } from "@/lib/assistant/provider";
import { CLUB_FACTS } from "./club-facts";
import { draftModelSchema, generateDraft, type DraftKind, type DraftOutput } from "./draft";
import type { ProspectDraftRow } from "./types";

/** A prompt-in, JSON-out function backed by the portal's AI providers (BayLeaf first: UCSC-run, free, zero data retention). */
export function modelGenerate(env: Record<string, string | undefined> = process.env): (prompt: string) => Promise<unknown> {
  const model = buildModel({ ...env, ASSISTANT_PRIMARY: "bayleaf" });
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
