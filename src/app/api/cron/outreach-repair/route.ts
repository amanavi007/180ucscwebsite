import { isPacificHour } from "@/lib/interview-reminders";
import { recordJobRun } from "@/lib/data/outreach";
import { buildRepairDeps } from "@/lib/data/outreach-discovery";
import { runRepair } from "@/lib/outreach/discovery/repair";

// Always run fresh; this reads the network and the database.
export const dynamic = "force-dynamic";
// Each company can take several page loads; the run stops starting new ones before this.
export const maxDuration = 300;

const REPAIR_HOUR = 5;
/** Companies given their next try per run, and how long the run may keep starting new ones. */
const PER_RUN = 150;
const BUDGET_MS = 200_000;

export async function GET(request: Request) {
  // An unset secret must never authenticate ("Bearer undefined").
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  // Vercel cron is UTC-only, so two schedules fire; only the one landing in 5am Pacific does work.
  if (!isPacificHour(new Date(), REPAIR_HOUR)) return Response.json({ skipped: "not 5am Pacific" });

  try {
    const result = await runRepair(await buildRepairDeps(), { limit: PER_RUN, concurrency: 6, budgetMs: BUDGET_MS });
    await recordJobRun("repair", new Date(), result);
    return Response.json(result);
  } catch (err) {
    console.error("outreach repair failed:", err);
    return Response.json({ error: err instanceof Error ? err.message : "failed" }, { status: 500 });
  }
}
