import { listCandidates } from "@/lib/data/outreach-agent-audit";
import { parseListQuery } from "@/lib/outreach/agent-audit";
import { agentRoute } from "@/lib/outreach/agent-route";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Every stored field of the discovery candidates, paged in a stable order. Reading never uses up the agent's attempts. */
export async function GET(request: Request) {
  return agentRoute(request, "outreach:audit", async ({ admin }) => {
    const parsed = parseListQuery(new URL(request.url).searchParams, ["outcome", "source"]);
    if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });
    return Response.json(await listCandidates(admin, parsed.query));
  });
}
