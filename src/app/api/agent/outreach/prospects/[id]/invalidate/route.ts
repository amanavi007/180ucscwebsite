import { buildProspectCorrectionDeps } from "@/lib/data/outreach-agent-correct";
import { invalidateProspect } from "@/lib/outreach/agent-correct";
import { isUuid } from "@/lib/outreach/agent-audit";
import { agentRoute, readJson } from "@/lib/outreach/agent-route";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Marks a prospect invalid and takes it out of drafting and sending. Refused once it has been sent to. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return agentRoute(request, "outreach:correct", async ({ admin, keyId }) => {
    const { id } = await params;
    if (!isUuid(id)) return Response.json({ error: "not_found" }, { status: 404 });
    const result = await invalidateProspect(id, await readJson(request), buildProspectCorrectionDeps(admin, keyId));
    return Response.json(result.body, { status: result.status });
  });
}
