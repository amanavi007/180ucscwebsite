import "server-only";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { effectiveStatus } from "@/lib/prelim-review/stale";
import {
  criteriaSchema,
  criterionResultSchema,
  STARTER_RUBRICS,
  type CriterionResult,
  type ReviewKind,
  type Rubric,
} from "@/lib/prelim-review/rubric";

/** Latest saved version, or the built-in starter rubric until an exec saves one. */
export async function getCurrentRubric(kind: ReviewKind): Promise<Rubric> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("review_rubrics")
    .select("kind, version, criteria, guide_text")
    .eq("kind", kind)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const parsed = data ? criteriaSchema.safeParse(data.criteria) : null;
  if (!data || !parsed?.success) return STARTER_RUBRICS[kind];
  return { kind, version: data.version, criteria: parsed.data, guideText: data.guide_text };
}

export interface PrelimReviewRow {
  id: string;
  projectId: string;
  projectName: string;
  fileName: string;
  fileUrl: string;
  kind: ReviewKind;
  rubricVersion: number;
  status: "running" | "done" | "error";
  verdict: "ready" | "needs_work" | null;
  results: CriterionResult[];
  errorMessage: string | null;
  createdAt: string;
  authorName: string;
}

/** Every review the signed-in person may see (row-level security: their projects' reviews, or all for execs). */
export async function listReviews(): Promise<PrelimReviewRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("prelim_reviews")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    // The Prelim review tab is secondary: a missing table (migration not applied yet) must not take the whole project page down.
    console.error("listReviews failed:", error.message);
    return [];
  }
  const rows = data ?? [];
  const now = new Date();
  const authorIds = [...new Set(rows.map((r) => r.created_by))];
  const names = new Map<string, string>();
  if (authorIds.length > 0) {
    const { data: people } = await supabase.from("profiles").select("id, name").in("id", authorIds);
    for (const p of people ?? []) names.set(p.id, p.name);
  }
  const projectIds = [...new Set(rows.map((r) => r.project_id))];
  const projectNames = new Map<string, string>();
  if (projectIds.length > 0) {
    const { data: projects } = await supabase.from("projects").select("id, client_name").in("id", projectIds);
    for (const p of projects ?? []) projectNames.set(p.id, p.client_name);
  }
  return rows.map((r) => {
    const results = z.array(criterionResultSchema).safeParse(r.result);
    const live = effectiveStatus({ status: r.status, createdAt: r.created_at }, now);
    return {
      id: r.id,
      projectId: r.project_id,
      projectName: projectNames.get(r.project_id) ?? "Project",
      fileName: r.file_name,
      fileUrl: r.file_url,
      kind: r.kind,
      rubricVersion: r.rubric_version,
      status: live.status,
      verdict: r.verdict,
      results: results.success ? results.data : [],
      errorMessage: r.error_message ?? live.errorMessage,
      createdAt: r.created_at,
      authorName: names.get(r.created_by) ?? "Someone",
    };
  });
}
