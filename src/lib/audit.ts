import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Best-effort audit write -- failures are logged but never thrown, so a
 * logging hiccup can't block the real admin action that already succeeded.
 */
export async function logAudit(
  actorId: string,
  action: string,
  targetLabel?: string | null,
  detail?: string | null,
) {
  const supabase = await createClient();
  const { error } = await supabase.from("audit_log").insert({
    actor_id: actorId,
    action,
    target_label: targetLabel ?? null,
    detail: detail ?? null,
  });
  if (error) console.error("audit log write failed:", error.message);
}
