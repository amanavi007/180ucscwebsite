import { buildRequeueDeps } from "@/lib/data/outreach-agent-audit";
import { isUuid, requeueCandidate } from "@/lib/outreach/agent-audit";
import { agentRoute, readOptionalJson } from "@/lib/outreach/agent-route";

export const dynamic = "force-dynamic";

/** Hands a fixed company back to discovery's repair job: attempts cleared, due on its next run. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return agentRoute(request, "outreach:audit", async ({ admin, keyId }) => {
    const { id } = await params;
    if (!isUuid(id)) return Response.json({ error: "not_found" }, { status: 404 });
    const result = await requeueCandidate(id, await readOptionalJson(request), buildRequeueDeps(admin, keyId));
    return Response.json(result.body, { status: result.status });
  });
}
