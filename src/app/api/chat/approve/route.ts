import { z } from "zod";
import { approveProposal, rejectProposal } from "@/lib/assistant/proposals";
import { registerExecutors, supabaseProposalStore } from "@/lib/assistant/tools/write-tools";
import { getCurrentProfile } from "@/lib/data/profile";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

registerExecutors();

const bodySchema = z.object({ id: z.string().uuid(), decision: z.enum(["approve", "reject"]) });

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ ok: false, error: "Bad request." }, { status: 400 });

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims.sub) return Response.json({ ok: false, error: "Please sign in." }, { status: 401 });

  // Role is read fresh from the database here, so a demotion since proposing is honoured.
  const profile = await getCurrentProfile();
  const actor = { id: profile.id, role: profile.role };
  const store = await supabaseProposalStore();

  if (parsed.data.decision === "reject") {
    const r = await rejectProposal(store, actor, parsed.data.id);
    return Response.json(r.ok ? { ok: true } : { ok: false, error: "This proposal can't be rejected." });
  }
  return Response.json(await approveProposal(store, actor, parsed.data.id, new Date()));
}
