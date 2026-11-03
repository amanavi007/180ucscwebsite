import { isPacificHour } from "@/lib/interview-reminders";
import { buildPrepareDeps, buildWebhookHealthDeps } from "@/lib/data/outreach";
import { runPrepare } from "@/lib/outreach/runner";
import { checkWebhookHealth } from "@/lib/outreach/webhook-health";

// Always run fresh; this reads the clock and the database.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PREPARE_HOUR = 7;

export async function GET(request: Request) {
  // An unset secret must never authenticate ("Bearer undefined").
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const now = new Date();
  // Vercel cron is UTC-only, so two schedules fire; only the one landing in 7am Pacific does work.
  if (!isPacificHour(now, PREPARE_HOUR)) return Response.json({ skipped: "not 7am Pacific" });

  // Independent of the pipeline: a switched-off webhook must be caught even while outreach is off.
  const webhook = await checkWebhookHealth(buildWebhookHealthDeps()).catch((err) => {
    console.error("outreach webhook health check failed:", err);
    return "check_failed" as const;
  });

  try {
    return Response.json({ webhook, ...(await runPrepare(await buildPrepareDeps(now))) });
  } catch (err) {
    console.error("outreach prepare failed:", err);
    return Response.json({ error: err instanceof Error ? err.message : "failed" }, { status: 500 });
  }
}
