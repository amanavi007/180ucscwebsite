import { buildSubmitDeps } from "@/lib/data/outreach-agent";
import { listProspects } from "@/lib/data/outreach-agent-audit";
import { parseListQuery } from "@/lib/outreach/agent-audit";
import { MAX_BATCH, submitBodySchema, submitProspects } from "@/lib/outreach/agent";
import { agentRoute, readJson } from "@/lib/outreach/agent-route";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Net-new researched prospects, up to 50 per batch. Safe to repeat: a batchId the server has seen returns the earlier
 * answer and adds nothing. Each row gets its own status so the agent learns what was skipped and why.
 */
export async function POST(request: Request) {
  return agentRoute(request, "outreach:submit", async ({ admin, keyId }) => {
    const parsed = submitBodySchema.safeParse(await readJson(request));
    if (!parsed.success) return Response.json({ error: "invalid_body", maxBatch: MAX_BATCH }, { status: 400 });
    const outcome = await submitProspects({ batchId: parsed.data.batchId, rows: parsed.data.prospects }, await buildSubmitDeps(admin, keyId));
    if (outcome.kind === "in_progress") return Response.json({ error: "batch_in_progress" }, { status: 409 });
    return Response.json(outcome.body);
  });
}

/** Audit read of the prospects: contact, status and the full fact list with sources, as drafting sees it. */
export async function GET(request: Request) {
  return agentRoute(request, "outreach:audit", async ({ admin }) => {
    const parsed = parseListQuery(new URL(request.url).searchParams, ["status"]);
    if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });
    return Response.json(await listProspects(admin, parsed.query));
  });
}
