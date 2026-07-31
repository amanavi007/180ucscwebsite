"use server";

import { createClient } from "@/lib/supabase/server";
import { roleLabel } from "@/lib/auth/roles";
import type { UserRole } from "@/lib/supabase/database.types";

export interface SearchResult {
  id: string;
  type: "project" | "task" | "wiki" | "member" | "client";
  title: string;
  subtitle: string | null;
  href: string;
}

/** Cross-cutting search over projects/tasks/wiki/people/clients. RLS scopes every table already. */
export async function globalSearch(query: string): Promise<SearchResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const supabase = await createClient();
  const like = `%${q}%`;

  const [projects, tasks, wikiPages, members, clients] = await Promise.all([
    supabase
      .from("projects")
      .select("id, client_name, quarter:quarters(name)")
      .ilike("client_name", like)
      .limit(5),
    supabase
      .from("tasks")
      .select("id, task_name, project_id, project:projects(client_name)")
      .ilike("task_name", like)
      .limit(5),
    supabase.from("wiki_pages").select("id, title, slug, section").ilike("title", like).limit(5),
    supabase.from("profiles").select("id, name, role").ilike("name", like).limit(5),
    supabase.from("clients").select("id, name").ilike("name", like).limit(5),
  ]);

  const results: SearchResult[] = [];

  for (const p of (projects.data ?? []) as unknown as {
    id: string;
    client_name: string;
    quarter: { name: string } | null;
  }[]) {
    results.push({
      id: p.id,
      type: "project",
      title: p.client_name,
      subtitle: p.quarter?.name ?? null,
      href: `/projects/${p.id}`,
    });
  }

  for (const t of (tasks.data ?? []) as unknown as {
    id: string;
    task_name: string;
    project_id: string;
    project: { client_name: string } | null;
  }[]) {
    results.push({
      id: t.id,
      type: "task",
      title: t.task_name,
      subtitle: t.project?.client_name ?? null,
      href: `/projects/${t.project_id}`,
    });
  }

  for (const w of (wikiPages.data ?? []) as unknown as {
    id: string;
    title: string;
    slug: string;
    section: string;
  }[]) {
    results.push({
      id: w.id,
      type: "wiki",
      title: w.title,
      subtitle: "Resources",
      href: `/resources?section=${w.section}&page=${w.slug}`,
    });
  }

  for (const m of (members.data ?? []) as unknown as { id: string; name: string; role: UserRole }[]) {
    results.push({
      id: m.id,
      type: "member",
      title: m.name,
      subtitle: roleLabel(m.role),
      href: "/directory",
    });
  }

  for (const c of (clients.data ?? []) as unknown as { id: string; name: string }[]) {
    results.push({
      id: c.id,
      type: "client",
      title: c.name,
      subtitle: "Client",
      href: `/clients/${c.id}`,
    });
  }

  return results;
}
