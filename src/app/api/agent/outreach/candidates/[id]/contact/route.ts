import { buildCandidateContactDeps } from "@/lib/data/outreach-agent-correct";
import { correctCandidateContact } from "@/lib/outreach/agent-correct";
import { isUuid } from "@/lib/outreach/agent-audit";
import { agentRoute, readJson } from "@/lib/outreach/agent-route";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Replaces or clears a stored candidate contact. A replacement gets the same checks as a task result, plus the source page must show the address. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return agentRoute(request, "outreach:correct", async ({ admin, keyId }) => {
    const { id } = await params;
    if (!isUuid(id)) return Response.json({ error: "not_found" }, { status: 404 });
    const result = await correctCandidateContact(id, await readJson(request), buildCandidateContactDeps(admin, keyId));
    return Response.json(result.body, { status: result.status });
  });
}
