import { isBlockedInbox } from "./discovery/emails";
import { ENGAGED_STATUSES, payloadContact, withoutPayloadContact } from "./agent-correct";

/**
 * The one-time re-screen of stored contacts against the junk and role-inbox blocklist. Pure: it decides, the caller
 * (src/lib/data/outreach-agent-correct.ts) writes. A prospect already written to is reported, never changed.
 */

export interface ScreenProspect {
  id: string;
  company: string;
  contactEmail: string;
  status: string;
  lastSentAt: string | null;
}
export interface ScreenCandidate {
  id: string;
  company: string;
  outcome: string;
  email: string | null;
  payload: unknown;
}

export interface RescreenPlan {
  /** Prospects to mark invalid (reason junk_contact). */
  prospects: { id: string; company: string; email: string; status: string }[];
  /** Prospects that match but were already sent to or answered; left alone. */
  engaged: { id: string; company: string; email: string; status: string }[];
  /** Ready candidates whose pooled email is blocked: payload email cleared, outcome back to no_email. */
  candidates: { id: string; company: string; email: string; payload: unknown }[];
}

export function planRescreen(prospects: ScreenProspect[], candidates: ScreenCandidate[]): RescreenPlan {
  const plan: RescreenPlan = { prospects: [], engaged: [], candidates: [] };
  for (const p of prospects) {
    if (p.status === "invalid" || !isBlockedInbox(p.contactEmail)) continue;
    const row = { id: p.id, company: p.company, email: p.contactEmail, status: p.status };
    if (ENGAGED_STATUSES.has(p.status) || p.lastSentAt) plan.engaged.push(row);
    else plan.prospects.push(row);
  }
  for (const c of candidates) {
    if (c.outcome !== "ready") continue;
    const email = payloadContact(c.payload).email ?? c.email;
    if (email && isBlockedInbox(email)) plan.candidates.push({ id: c.id, company: c.company, email, payload: withoutPayloadContact(c.payload) });
  }
  return plan;
}
