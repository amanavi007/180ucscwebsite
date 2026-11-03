import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { EXEC_ROLES } from "@/lib/auth/roles";
import { CLIENTS } from "@/lib/clients";
import { formatOrgDate } from "@/lib/date";
import { fetchAllPages } from "@/lib/paginate";
import { pacificInstant } from "@/lib/outreach/pacing";
import { fetchPageHtml, fetchRobotsTxt, loadYcDataset } from "@/lib/outreach/discovery/web";
import type { DiscoveryDeps } from "@/lib/outreach/discovery/runner";
import { summarizeCandidates, type CandidateSummary, type CandidateView } from "@/lib/outreach/discovery/view";
import { OUTREACH_SETTING_KEYS, parseOutreachSettings, type OutreachSettings } from "@/lib/outreach/settings";
import { emailDomain } from "@/lib/outreach/verify";
import { factsToJson, loadOutreachSettings } from "./outreach";

type Admin = ReturnType<typeof createAdminClient>;

/** Prospects waiting to be sent above this many mean discovery is outrunning sending (three times the top daily cap of 40). */
const BACKLOG_LIMIT = 120;
const MAX_ATTEMPTS_PER_RUN = 60;
const BUDGET_MS = 240_000;

/** Who the discovered prospects are created by: the exec who switched discovery on, else the first exec. */
async function discoveryOwner(admin: Admin): Promise<string> {
  const { data: setting } = await admin.from("org_settings").select("value").eq("key", "outreach_discovery_enabled_by").maybeSingle();
  if (setting?.value) {
    const { data } = await admin.from("profiles").select("id").eq("id", setting.value).maybeSingle();
    if (data) return data.id;
  }
  const { data, error } = await admin.from("profiles").select("id").in("role", EXEC_ROLES).order("created_at").limit(1);
  if (error || !data?.[0]) throw new Error("No exec profile to create discovered prospects under.");
  return data[0].id;
}

export async function buildDiscoveryDeps(): Promise<DiscoveryDeps> {
  const admin = createAdminClient();
  const settings = await loadOutreachSettings(admin);
  // Needed even while the daily job is off: "Find companies now" runs regardless of the switch.
  const owner = await discoveryOwner(admin);

  const suppressed = async (column: "email" | "domain", value: string) => {
    const { data, error } = await admin.from("outreach_suppressions").select("id").eq(column, value).limit(1);
    if (error) throw error;
    return (data?.length ?? 0) > 0;
  };
  const prospectBy = async (column: "contact_email" | "contact_domain", value: string) => {
    const { data, error } = await admin.from("outreach_prospects").select("id").eq(column, value).limit(1);
    if (error) throw error;
    return (data?.length ?? 0) > 0;
  };

  return {
    enabled: settings.discoveryEnabled,
    perDay: settings.discoveryPerDay,
    maxAttempts: MAX_ATTEMPTS_PER_RUN,
    budgetMs: BUDGET_MS,
    backlogLimit: BACKLOG_LIMIT,
    filter: { regions: settings.discoveryRegions, industries: settings.discoveryIndustries, maxTeamSize: settings.discoveryMaxTeam },
    now: () => Date.now(),

    loadDataset: loadYcDataset,

    seenDomains: async () => {
      const rows = await fetchAllPages((from, to) => admin.from("outreach_discovery_candidates").select("domain").order("domain").range(from, to));
      return new Set(rows.map((r) => r.domain));
    },

    addedToday: async () => {
      const since = pacificInstant(formatOrgDate(new Date()), 0).toISOString();
      const { count, error } = await admin
        .from("outreach_discovery_candidates")
        .select("id", { count: "exact", head: true })
        .eq("outcome", "added")
        .gte("created_at", since);
      if (error) throw error;
      return count ?? 0;
    },

    backlog: async () => {
      const { count, error } = await admin
        .from("outreach_prospects")
        .select("id", { count: "exact", head: true })
        .in("status", ["new", "verified", "drafted"]); // in-ok: short list of statuses
      if (error) throw error;
      return count ?? 0;
    },

    findDuplicate: async ({ domain, name }) => {
      if (await prospectBy("contact_domain", domain)) return "Already a prospect.";
      if (await suppressed("domain", domain)) return "On the do-not-contact list.";
      const key = name.trim().toLowerCase();
      if (CLIENTS.some((c) => c.name.trim().toLowerCase() === key)) return "A past client.";
      const { data, error } = await admin.from("clients").select("name");
      if (error) throw error;
      if ((data ?? []).some((c) => c.name.trim().toLowerCase() === key)) return "A past client.";
      return null;
    },

    emailTaken: async (email) => {
      if (await prospectBy("contact_email", email)) return "That address is already a prospect.";
      if (await suppressed("email", email)) return "That address is on the do-not-contact list.";
      return null;
    },

    fetchRobots: fetchRobotsTxt,
    fetchPage: fetchPageHtml,

    recordCandidate: async (r) => {
      const { error } = await admin.from("outreach_discovery_candidates").upsert(
        {
          source: r.source,
          source_ref: r.sourceRef,
          company: r.company,
          website: r.website,
          domain: r.domain,
          outcome: r.outcome,
          reason: r.reason,
          prospect_id: r.prospectId,
          email: r.email,
          email_source_url: r.emailSourceUrl,
        },
        { onConflict: "domain", ignoreDuplicates: true },
      );
      if (error) throw error;
    },

    addProspect: async (p) => {
      const { data, error } = await admin
        .from("outreach_prospects")
        .insert({
          company: p.company,
          website: p.website,
          niche: p.niche,
          size_stage: p.sizeStage,
          summary: p.summary,
          facts: factsToJson(p.facts),
          contact_email: p.email,
          contact_domain: emailDomain(p.email),
          created_by: owner,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    },
  };
}

export interface DiscoveryOverview {
  settings: OutreachSettings;
  candidates: CandidateView[];
  summary: Omit<CandidateSummary, "lastRunAt"> & { lastRunAt: string | null };
  /** Prospects waiting to be sent, against the limit that pauses discovery. */
  backlog: number;
  backlogLimit: number;
}

const LIST_LIMIT = 400;

/** Read as the signed-in exec (RLS), so this page never needs the service role. */
export async function getDiscoveryOverview(now = new Date()): Promise<DiscoveryOverview> {
  const supabase = await createClient();
  const [settingRows, candidateRows, backlog] = await Promise.all([
    supabase.from("org_settings").select("key, value").in("key", OUTREACH_SETTING_KEYS),
    supabase.from("outreach_discovery_candidates").select("*").order("created_at", { ascending: false }).limit(LIST_LIMIT),
    supabase.from("outreach_prospects").select("id", { count: "exact", head: true }).in("status", ["new", "verified", "drafted"]), // in-ok: short list of statuses
  ]);
  for (const r of [settingRows, candidateRows, backlog]) if (r.error) throw r.error;
  const candidates: CandidateView[] = (candidateRows.data ?? []).map((r) => ({
    id: r.id,
    sourceRef: r.source_ref,
    company: r.company,
    website: r.website,
    domain: r.domain,
    outcome: r.outcome,
    reason: r.reason,
    prospectId: r.prospect_id,
    email: r.email,
    emailSourceUrl: r.email_source_url,
    createdAt: r.created_at,
  }));
  const summary = summarizeCandidates(candidates, now);
  return {
    settings: parseOutreachSettings(settingRows.data ?? []),
    candidates,
    summary: { ...summary, lastRunAt: summary.lastRunAt?.toISOString() ?? null },
    backlog: backlog.count ?? 0,
    backlogLimit: BACKLOG_LIMIT,
  };
}
