import { z } from "zod";
import { buildModel } from "@/lib/assistant/provider";
import { getCurrentProfile } from "@/lib/data/profile";
import { getCurrentRubric } from "@/lib/data/prelim-review";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import { DriveError, driveErrorMessage, fetchDriveFile } from "@/lib/prelim-review/drive";
import { docFacts, isEffectivelyEmpty, slideFacts } from "@/lib/prelim-review/extract";
import { hourAgoIso, isOverLimit } from "@/lib/prelim-review/rate-limit";
import { friendlyReviewError, modelGenerate, runReview } from "@/lib/prelim-review/review";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const bodySchema = z.object({
  projectId: z.uuid(),
  fileId: z.string().min(5).max(200),
  accessToken: z.string().min(10).max(4096),
});

const json = (status: number, error: string) => Response.json({ error }, { status });

export async function POST(request: Request) {
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return json(400, "Bad request.");

  // proxy.ts only redirects /portal paths, so the API route must check itself.
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims.sub) return json(401, "Please sign in.");
  const profile = await getCurrentProfile();
  const { projectId, fileId, accessToken } = body.data;

  const { count } = await supabase
    .from("prelim_reviews")
    .select("id", { count: "exact", head: true })
    .eq("created_by", profile.id)
    .gte("created_at", hourAgoIso(new Date()));
  if (isOverLimit(count ?? 0)) return json(429, "You have used your 10 reviews for this hour. Try again later.");

  const model = buildModel();
  if (!model) return json(503, "The reviewer is not set up yet. Ask an exec to add an AI key.");

  let file;
  try {
    file = await fetchDriveFile(fileId, accessToken);
  } catch (err) {
    return json(400, driveErrorMessage(err instanceof DriveError ? err.code : "failed"));
  }

  const rubric = await getCurrentRubric(file.kind);
  const { data: row, error: insertError } = await supabase
    .from("prelim_reviews")
    .insert({
      project_id: projectId,
      created_by: profile.id,
      file_id: file.id,
      file_name: file.name,
      file_url: file.url,
      kind: file.kind,
      rubric_version: rubric.version,
    })
    .select("id")
    .single();
  // RLS rejects people who are not on the project (execs always pass).
  if (insertError || !row) return json(403, "You can only review files for your own projects.");

  const finish = (patch: Database["public"]["Tables"]["prelim_reviews"]["Update"]) => supabase.from("prelim_reviews").update(patch).eq("id", row.id);

  if (isEffectivelyEmpty(file.text)) {
    await finish({ status: "error", error_message: "That file has almost no text to review. Add your content and try again." });
    return Response.json({ id: row.id });
  }

  try {
    const facts = file.kind === "slides" ? slideFacts(file.slideTexts) : docFacts(file.text);
    const { results, verdict } = await runReview({ rubric, text: file.text, facts, pdf: file.pdf }, modelGenerate(model));
    await finish({ status: "done", verdict, result: results });
  } catch (err) {
    console.error("prelim review failed:", err instanceof Error ? err.message : err);
    await finish({ status: "error", error_message: friendlyReviewError(err) });
  }
  return Response.json({ id: row.id });
}
