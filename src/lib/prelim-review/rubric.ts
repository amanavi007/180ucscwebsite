import { z } from "zod";

export const REVIEW_KINDS = ["doc", "slides"] as const;
export type ReviewKind = (typeof REVIEW_KINDS)[number];
export const KIND_LABELS: Record<ReviewKind, string> = { doc: "Research doc", slides: "Slides" };

export const criterionSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]{1,40}$/, "Use lowercase letters, numbers and underscores."),
  title: z.string().trim().min(1, "Give each criterion a title.").max(80),
  description: z.string().trim().min(1, "Describe what a pass looks like.").max(600),
});
export type Criterion = z.infer<typeof criterionSchema>;

export const criteriaSchema = z
  .array(criterionSchema)
  .min(1, "Add at least one criterion.")
  .max(30)
  .refine((list) => new Set(list.map((c) => c.id)).size === list.length, "Criterion ids must be unique.");

export interface Rubric {
  kind: ReviewKind;
  version: number;
  criteria: Criterion[];
  guideText: string;
}

export type ReviewStatus = "pass" | "fix" | "missing";

export const criterionResultSchema = z.object({
  criterionId: z.string(),
  status: z.enum(["pass", "fix", "missing"]),
  evidence: z.string(),
  suggestion: z.string(),
});
export type CriterionResult = z.infer<typeof criterionResultSchema>;

export const modelOutputSchema = z.object({ results: z.array(criterionResultSchema) });

/** Used until an exec saves the first real version. Clearly generic on purpose. */
export const STARTER_RUBRICS: Record<ReviewKind, Rubric> = {
  doc: {
    kind: "doc",
    version: 0,
    guideText: "Starter rules. An exec should replace these with the chapter's real formatting guide.",
    criteria: [
      { id: "structure", title: "Clear structure", description: "Has a title, headed sections and a logical order. Headings are consistent." },
      { id: "evidence_detail", title: "Evidence is detailed", description: "Claims are backed by specific data, figures or examples, not general statements." },
      { id: "sources_present", title: "Claims are sourced", description: "Each factual claim or statistic has a source nearby." },
      { id: "sources_proper", title: "Sources are proper", description: "Sources are reputable and cited in a consistent format with enough detail to find them (author or publisher, title, date, link)." },
      { id: "formatting", title: "Formatting follows the guide", description: "Fonts, spacing, headings and lists follow the formatting guide text." },
      { id: "prelim_ready", title: "Strong enough for prelim check", description: "The research answers the project question well enough to present at a prelim check." },
    ],
  },
  slides: {
    kind: "slides",
    version: 0,
    guideText: "Starter rules. An exec should replace these with the chapter's real slide formatting guide.",
    criteria: [
      { id: "formatting", title: "Formatting follows the guide", description: "Fonts, sizes, colors, alignment and layout follow the slide formatting guide text." },
      { id: "sources_every_slide", title: "Source on every content slide", description: "Every content slide has a visible source line." },
      { id: "sources_proper", title: "Sources are proper", description: "Sources are reputable and cited consistently with enough detail to find them." },
      { id: "content_quality", title: "Content is strong", description: "Each slide makes one clear point with specific evidence; titles state the takeaway." },
      { id: "background_bubbles", title: "Background bubbles exist", description: "Slides include the background context bubbles the guide asks for." },
      { id: "prelim_ready", title: "Strong enough for prelim check", description: "The deck tells a coherent story ready to present at a prelim check." },
    ],
  },
};

const RERUN = "The reviewer did not assess this item. Run the review again.";

/** One result per rubric criterion, in rubric order. Unknown ids are dropped; the first duplicate wins. */
export function normalizeResults(criteria: Criterion[], raw: CriterionResult[]): CriterionResult[] {
  const byId = new Map<string, CriterionResult>();
  for (const r of raw) if (!byId.has(r.criterionId)) byId.set(r.criterionId, r);
  return criteria.map(
    (c) => byId.get(c.id) ?? { criterionId: c.id, status: "fix", evidence: "", suggestion: RERUN },
  );
}

export function computeVerdict(results: CriterionResult[]): "ready" | "needs_work" {
  return results.length > 0 && results.every((r) => r.status === "pass") ? "ready" : "needs_work";
}
