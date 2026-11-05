import { normalizeStage } from "./view";

const COMPANIES_PATH = "/portal/admin/outreach/companies";

/** The Companies address, optionally on a stage or with one company's panel open. */
export function companiesHref(params: { stage?: string; prospect?: string; candidate?: string } = {}): string {
  const q = new URLSearchParams();
  if (params.stage) q.set("stage", params.stage);
  if (params.prospect) q.set("prospect", params.prospect);
  if (params.candidate) q.set("candidate", params.candidate);
  const query = q.toString();
  return query ? `${COMPANIES_PATH}?${query}` : COMPANIES_PATH;
}

const OUTCOME_TO_STAGE: Record<string, string> = { ready: "found", added: "found", skipped: "skipped" };

/** Where an old Pipeline or Discovery link should go now, or null when the address is just the Today page. */
export function legacyOutreachRedirect(params: { stage?: string; prospect?: string; candidate?: string; outcome?: string }): string | null {
  const stage = params.stage ? normalizeStage(params.stage) : params.outcome ? OUTCOME_TO_STAGE[params.outcome] : undefined;
  if (!stage && !params.prospect && !params.candidate) return null;
  return companiesHref({ stage, prospect: params.prospect, candidate: params.candidate });
}
