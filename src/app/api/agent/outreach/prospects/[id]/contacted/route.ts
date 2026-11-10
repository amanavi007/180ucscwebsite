import { buildProspectCorrectionDeps } from "@/lib/data/outreach-agent-correct";
import { markProspectContacted } from "@/lib/outreach/agent-correct";
import { isUuid } from "@/lib/outreach/agent-audit";
import { agentRoute, readOptionalJson } from "@/lib/outreach/agent-route";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Marks a prospect contacted (emailed outside the pipeline) so the automated system never emails them. No-op once the pipeline has written to them. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return agentRoute(request, "outreach:correct", async ({ admin, keyId }) => {
    const { id } = await params;
    if (!isUuid(id)) return Response.json({ error: "not_found" }, { status: 404 });
    const result = await markProspectContacted(id, await readOptionalJson(request), buildProspectCorrectionDeps(admin, keyId));
    return Response.json(result.body, { status: result.status });
  });
}
