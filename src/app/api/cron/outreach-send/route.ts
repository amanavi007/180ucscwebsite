import { isPacificHour } from "@/lib/interview-reminders";
import { buildSendDeps, recordJobRun, reportJobFailure } from "@/lib/data/outreach";
import { runSend } from "@/lib/outreach/runner";

// Always run fresh; this reads the clock and the database.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SEND_HOUR = 8;

export async function GET(request: Request) {
  // An unset secret must never authenticate ("Bearer undefined").
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const now = new Date();
  // Vercel cron is UTC-only, so two schedules fire; only the one landing in 8am Pacific does work.
  if (!isPacificHour(now, SEND_HOUR)) return Response.json({ skipped: "not 8am Pacific" });

  try {
    const result = await runSend(await buildSendDeps(now));
    await recordJobRun("send", now, result);
    return Response.json(result);
  } catch (err) {
    console.error("outreach send failed:", err);
    await reportJobFailure("send", err);
    return Response.json({ error: err instanceof Error ? err.message : "failed" }, { status: 500 });
  }
}
