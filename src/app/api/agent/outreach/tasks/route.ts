import { claimAgentTasks } from "@/lib/data/outreach-agent";
import { parseClaimCount, toTask } from "@/lib/outreach/agent";
import { agentRoute } from "@/lib/outreach/agent-route";

export const dynamic = "force-dynamic";

/** Leases companies the crawler could not finish (no published email, or site unreachable) for the agent to research. */
export async function GET(request: Request) {
  return agentRoute(request, "outreach:enrich", async ({ admin }) => {
    const count = parseClaimCount(new URL(request.url).searchParams.get("claim"));
    const tasks = await claimAgentTasks(admin, count);
    return Response.json({ tasks: tasks.map(toTask) });
  });
}
