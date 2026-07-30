import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface AuditLogRow {
  id: string;
  action: string;
  targetLabel: string | null;
  detail: string | null;
  actorName: string;
  createdAt: string;
}

export async function getAuditLog(limit = 200): Promise<AuditLogRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("audit_log")
    .select("id, action, target_label, detail, created_at, actor:profiles(name)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;

  return (
    data as unknown as {
      id: string;
      action: string;
      target_label: string | null;
      detail: string | null;
      created_at: string;
      actor: { name: string } | null;
    }[]
  ).map((r) => ({
    id: r.id,
    action: r.action,
    targetLabel: r.target_label,
    detail: r.detail,
    actorName: r.actor?.name ?? "Someone (removed)",
    createdAt: r.created_at,
  }));
}
