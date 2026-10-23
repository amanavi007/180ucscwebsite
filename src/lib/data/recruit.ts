import "server-only";
import { createClient } from "@/lib/supabase/server";
import { fetchAllPages, fetchInChunks } from "@/lib/paginate";
import { getQuarters } from "@/lib/data/quarters";
import { sumPoints, undoableMergeIds, type RecruitSection } from "@/lib/recruit";
import { pairKey, type MatchableApplicant } from "@/lib/recruit-matching";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export interface RecruitCategory {
  id: string;
  name: string;
  section: RecruitSection;
  defaultPoints: number;
  sortOrder: number;
  archived: boolean;
  /** Set for categories the app uses automatically (e.g. coffee chat points); these can't be archived. */
  systemKey: string | null;
}

export interface RecruitEvent {
  id: string;
  quarterId: string;
  categoryId: string;
  name: string;
  date: string;
}

export interface PointEntry {
  id: string;
  categoryId: string;
  categoryName: string;
  eventId: string | null;
  eventName: string | null;
  points: number;
  reason: string | null;
  source: "manual" | "import" | "booking";
  awardedByName: string | null;
  createdAt: string;
  voidedAt: string | null;
  voidReason: string | null;
}

export interface ApplicantRow {
  id: string;
  quarterId: string;
  name: string;
  email: string | null;
  major: string | null;
  year: string | null;
  notes: string;
  applicationLink: string | null;
  /** True when they came in through the application form import; only these are reviewed. */
  hasApplication: boolean;
  hasPrevious: boolean;
  previousQuarterName: string | null;
  aliases: string[];
  entries: PointEntry[];
  total: number;
}

export interface MergeLogRow {
  id: string;
  survivorName: string;
  absorbedName: string;
  createdAt: string;
  /** False when a newer merge into the same survivor must be undone first. */
  canUndo: boolean;
}

export async function getRecruitCategories(): Promise<RecruitCategory[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("recruit_categories")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    section: c.section,
    defaultPoints: Number(c.default_points),
    sortOrder: c.sort_order,
    archived: c.archived_at !== null,
    systemKey: c.system_key,
  }));
}

export async function getRecruitEvents(quarterId: string): Promise<RecruitEvent[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("recruit_events")
    .select("*")
    .eq("quarter_id", quarterId)
    .order("date", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((e) => ({
    id: e.id,
    quarterId: e.quarter_id,
    categoryId: e.category_id,
    name: e.name,
    date: e.date,
  }));
}

async function lookupProfileNames(supabase: Supabase, ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase.from("profiles").select("id, name").in("id", ids); // in-ok: profile ids of execs
  if (error) throw error;
  return new Map((data ?? []).map((p) => [p.id, p.name]));
}

const ID_CHUNK = 100;

export async function getApplicantRows(quarterId: string): Promise<ApplicantRow[]> {
  const supabase = await createClient();

  const [applicants, aliases, categories, events, quarters] = await Promise.all([
    fetchAllPages((from, to) =>
      supabase
        .from("recruit_applicants")
        .select("*")
        .eq("quarter_id", quarterId)
        .is("archived_at", null)
        .order("name")
        .order("id")
        .range(from, to),
    ),
    fetchAllPages((from, to) =>
      supabase
        .from("recruit_applicant_aliases")
        .select("applicant_id, alias")
        .eq("quarter_id", quarterId)
        .order("id")
        .range(from, to),
    ),
    getRecruitCategories(),
    getRecruitEvents(quarterId),
    getQuarters(),
  ]);

  const ids = applicants.map((a) => a.id);
  const pointRows = [];
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const chunk = ids.slice(i, i + ID_CHUNK);
    pointRows.push(
      ...(await fetchAllPages((from, to) =>
        supabase
          .from("recruit_points")
          .select("*")
          .in("applicant_id", chunk)
          .order("created_at", { ascending: false })
          .order("id")
          .range(from, to),
      )),
    );
  }

  const withApplication = new Set<string>();
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const chunk = ids.slice(i, i + ID_CHUNK);
    const answers = await fetchAllPages((from, to) =>
      supabase.from("recruit_applicant_answers").select("applicant_id").in("applicant_id", chunk).order("applicant_id").range(from, to),
    );
    for (const a of answers) withApplication.add(a.applicant_id);
  }

  const awarderNames = await lookupProfileNames(
    supabase,
    [...new Set(pointRows.map((p) => p.awarded_by).filter((x): x is string => !!x))],
  );

  const previousIds = [...new Set(applicants.map((a) => a.previous_applicant_id).filter((x): x is string => !!x))];
  const previousQuarterById = new Map<string, string>();
  if (previousIds.length > 0) {
    const data = await fetchInChunks(previousIds, (chunk, from, to) =>
      supabase.from("recruit_applicants").select("id, quarter_id").in("id", chunk).order("id").range(from, to),
    );
    const quarterName = new Map(quarters.map((q) => [q.id, q.name]));
    for (const row of data) {
      const name = quarterName.get(row.quarter_id);
      if (name) previousQuarterById.set(row.id, name);
    }
  }

  const categoryName = new Map(categories.map((c) => [c.id, c.name]));
  const eventName = new Map(events.map((e) => [e.id, e.name]));

  const aliasesByApplicant = new Map<string, string[]>();
  for (const a of aliases) {
    aliasesByApplicant.set(a.applicant_id, [...(aliasesByApplicant.get(a.applicant_id) ?? []), a.alias]);
  }

  const entriesByApplicant = new Map<string, PointEntry[]>();
  for (const p of pointRows) {
    const entry: PointEntry = {
      id: p.id,
      categoryId: p.category_id,
      categoryName: categoryName.get(p.category_id) ?? "Unknown category",
      eventId: p.event_id,
      eventName: p.event_id ? (eventName.get(p.event_id) ?? null) : null,
      points: Number(p.points),
      reason: p.reason,
      source: p.source,
      awardedByName: p.awarded_by ? (awarderNames.get(p.awarded_by) ?? null) : null,
      createdAt: p.created_at,
      voidedAt: p.voided_at,
      voidReason: p.void_reason,
    };
    entriesByApplicant.set(p.applicant_id, [...(entriesByApplicant.get(p.applicant_id) ?? []), entry]);
  }

  return applicants.map((a) => {
    const entries = entriesByApplicant.get(a.id) ?? [];
    return {
      id: a.id,
      quarterId: a.quarter_id,
      name: a.name,
      email: a.email,
      major: a.major,
      year: a.year,
      notes: a.notes,
      applicationLink: a.application_link,
      hasApplication: withApplication.has(a.id),
      hasPrevious: a.previous_applicant_id !== null,
      previousQuarterName: a.previous_applicant_id ? (previousQuarterById.get(a.previous_applicant_id) ?? null) : null,
      aliases: aliasesByApplicant.get(a.id) ?? [],
      entries,
      total: sumPoints(entries),
    };
  });
}

/** Live applicants in a quarter, shaped for the matcher. */
export async function getMatchableApplicants(quarterId: string): Promise<MatchableApplicant[]> {
  const supabase = await createClient();
  const [applicants, aliases] = await Promise.all([
    fetchAllPages((from, to) =>
      supabase
        .from("recruit_applicants")
        .select("id, name, email")
        .eq("quarter_id", quarterId)
        .is("archived_at", null)
        .order("id")
        .range(from, to),
    ),
    fetchAllPages((from, to) =>
      supabase
        .from("recruit_applicant_aliases")
        .select("applicant_id, alias")
        .eq("quarter_id", quarterId)
        .order("id")
        .range(from, to),
    ),
  ]);
  const byApplicant = new Map<string, string[]>();
  for (const a of aliases) byApplicant.set(a.applicant_id, [...(byApplicant.get(a.applicant_id) ?? []), a.alias]);
  return applicants.map((a) => ({ id: a.id, name: a.name, email: a.email, aliases: byApplicant.get(a.id) ?? [] }));
}

export async function getDismissedPairKeys(): Promise<Set<string>> {
  const supabase = await createClient();
  const rows = await fetchAllPages((from, to) =>
    supabase
      .from("recruit_not_duplicates")
      .select("applicant_a, applicant_b")
      .order("applicant_a")
      .order("applicant_b")
      .range(from, to),
  );
  return new Set(rows.map((r) => pairKey(r.applicant_a, r.applicant_b)));
}

/** Merges in this quarter that can still be undone, newest first. */
export async function getRecentMerges(quarterId: string): Promise<MergeLogRow[]> {
  const supabase = await createClient();
  const { data: logs, error } = await supabase
    .from("recruit_merge_log")
    .select("id, survivor_id, absorbed_id, created_at")
    .is("undone_at", null)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  if (!logs || logs.length === 0) return [];

  const ids = [...new Set(logs.flatMap((l) => [l.survivor_id, l.absorbed_id]))];
  const people = await fetchInChunks(ids, (chunk, from, to) =>
    supabase.from("recruit_applicants").select("id, name, quarter_id").in("id", chunk).order("id").range(from, to),
  );
  const byId = new Map(people.map((p) => [p.id, p]));

  const undoable = undoableMergeIds(
    logs.map((l) => ({ id: l.id, survivorId: l.survivor_id, createdAt: l.created_at, undoneAt: null })),
  );

  return logs
    .filter((l) => byId.get(l.survivor_id)?.quarter_id === quarterId)
    .map((l) => ({
      id: l.id,
      survivorName: byId.get(l.survivor_id)?.name ?? "Unknown",
      absorbedName: byId.get(l.absorbed_id)?.name ?? "Unknown",
      createdAt: l.created_at,
      canUndo: undoable.has(l.id),
    }));
}
