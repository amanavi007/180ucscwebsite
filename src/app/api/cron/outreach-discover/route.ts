import { isPacificHour } from "@/lib/interview-reminders";
import { recordJobRun } from "@/lib/data/outreach";
import { buildDiscoveryDeps } from "@/lib/data/outreach-discovery";
import { runDiscovery } from "@/lib/outreach/discovery/runner";

// Always run fresh; this reads the clock, the network and the database.
export const dynamic = "force-dynamic";
// Looking at a few dozen company websites takes minutes, not seconds.
export const maxDuration = 300;

const DISCOVER_HOUR = 6;

export async function GET(request: Request) {
  // An unset secret must never authenticate ("Bearer undefined").
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  // Vercel cron is UTC-only, so two schedules fire; only the one landing in 6am Pacific does work.
  if (!isPacificHour(new Date(), DISCOVER_HOUR)) return Response.json({ skipped: "not 6am Pacific" });

  try {
    const result = await runDiscovery(await buildDiscoveryDeps());
    await recordJobRun("discover");
    return Response.json(result);
  } catch (err) {
    console.error("outreach discovery failed:", err);
    return Response.json({ error: err instanceof Error ? err.message : "failed" }, { status: 500 });
  }
}
