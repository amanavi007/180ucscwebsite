import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface ClientListRow {
  id: string;
  name: string;
  contactName: string | null;
  contactEmail: string | null;
  projectCount: number;
  lastQuarterName: string | null;
  isCurrent: boolean;
}

export interface ClientProject {
  id: string;
  clientName: string;
  quarterId: string;
  quarterName: string;
  status: string;
  health: string;
}

export interface ClientDetail {
  id: string;
  name: string;
  contactName: string | null;
  contactEmail: string | null;
  notes: string | null;
  projects: ClientProject[];
}

/** Every client, with a project count and the most recent quarter they were worked with. */
export async function getClients(): Promise<ClientListRow[]> {
  const supabase = await createClient();
  const { data: clients, error } = await supabase
    .from("clients")
    .select("id, name, contact_name, contact_email")
    .order("name", { ascending: true });
  if (error) throw error;
  if (!clients || clients.length === 0) return [];

  const [{ data: projects, error: projectsError }, { data: activeQuarter }] = await Promise.all([
    supabase
      .from("projects")
      .select("client_id, quarter:quarters(id, name, start_date)")
      .in(
        "client_id",
        clients.map((c) => c.id),
      ),
    supabase.from("quarters").select("id").eq("is_active", true).maybeSingle(),
  ]);
  if (projectsError) throw projectsError;

  const byClient = new Map<string, { id: string; name: string; start_date: string | null }[]>();
  for (const p of (projects ?? []) as unknown as {
    client_id: string | null;
    quarter: { id: string; name: string; start_date: string | null } | null;
  }[]) {
    if (!p.client_id || !p.quarter) continue;
    const list = byClient.get(p.client_id) ?? [];
    list.push(p.quarter);
    byClient.set(p.client_id, list);
  }

  return clients
    .map((c) => {
      const quarters = (byClient.get(c.id) ?? []).sort((a, b) =>
        (b.start_date ?? "").localeCompare(a.start_date ?? ""),
      );
      return {
        id: c.id,
        name: c.name,
        contactName: c.contact_name,
        contactEmail: c.contact_email,
        projectCount: quarters.length,
        lastQuarterName: quarters[0]?.name ?? null,
        isCurrent: !!activeQuarter && quarters.some((q) => q.id === activeQuarter.id),
      };
    })
    .sort((a, b) => Number(b.isCurrent) - Number(a.isCurrent));
}

/** A single client's contact info + every project they've been linked to, across quarters. */
export async function getClient(id: string): Promise<ClientDetail | null> {
  const supabase = await createClient();
  const { data: client, error } = await supabase
    .from("clients")
    .select("id, name, contact_name, contact_email, notes")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!client) return null;

  const { data: projects, error: projectsError } = await supabase
    .from("projects")
    .select("id, client_name, quarter_id, status, health, quarter:quarters(name, start_date)")
    .eq("client_id", id);
  if (projectsError) throw projectsError;

  const rows = (
    projects as unknown as {
      id: string;
      client_name: string;
      quarter_id: string;
      status: string;
      health: string;
      quarter: { name: string; start_date: string | null } | null;
    }[]
  )
    .slice()
    .sort((a, b) => (b.quarter?.start_date ?? "").localeCompare(a.quarter?.start_date ?? ""))
    .map((p) => ({
      id: p.id,
      clientName: p.client_name,
      quarterId: p.quarter_id,
      quarterName: p.quarter?.name ?? "Unknown quarter",
      status: p.status,
      health: p.health,
    }));

  return {
    id: client.id,
    name: client.name,
    contactName: client.contact_name,
    contactEmail: client.contact_email,
    notes: client.notes,
    projects: rows,
  };
}
