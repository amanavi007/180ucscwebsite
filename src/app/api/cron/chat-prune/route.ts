import { cutoffDate } from "@/lib/assistant/retention";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// System job with no signed-in user, so the admin client is correct here (the one place the
// assistant uses it). Auth is the same CRON_SECRET bearer check as the other cron routes.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const supabase = createAdminClient();
  const cutoff = cutoffDate(new Date());
  const usageCutoff = cutoffDate(new Date(), 400).slice(0, 10);

  const threads = await supabase.from("chat_threads").delete({ count: "exact" }).lt("updated_at", cutoff);
  const proposals = await supabase
    .from("chat_proposals")
    .delete({ count: "exact" })
    .lt("created_at", cutoff)
    .neq("status", "pending");
  const usage = await supabase.from("chat_usage").delete({ count: "exact" }).lt("day", usageCutoff);

  const error = threads.error ?? proposals.error ?? usage.error;
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ threads: threads.count, proposals: proposals.count, usage: usage.count });
}
