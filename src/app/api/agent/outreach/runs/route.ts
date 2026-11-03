import { recordAgentRun } from "@/lib/data/outreach-agent";
import { recordJobRun } from "@/lib/data/outreach";
import { runReportSchema } from "@/lib/outreach/agent";
import { agentRoute, readJson } from "@/lib/outreach/agent-route";

export const dynamic = "force-dynamic";

/**
 * The agent's report and heartbeat. Always sent at the end of a run, including a failed one (detail.error), so a quiet
 * agent and a broken one can be told apart. It feeds the same "last ran" line the daily jobs use.
 */
export async function POST(request: Request) {
  return agentRoute(request, "outreach:read", async ({ admin, keyId }) => {
    const parsed = runReportSchema.safeParse(await readJson(request));
    if (!parsed.success) return Response.json({ error: "invalid_body" }, { status: 400 });
    await recordAgentRun(admin, keyId, parsed.data);
    await recordJobRun("agent", new Date(), parsed.data);
    return Response.json({ recorded: true });
  });
}
