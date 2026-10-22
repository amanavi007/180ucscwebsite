# Automated Client Outreach — Design

Date: 2026-10-22
Status: Draft for review
Supersedes: `2026-10-07-outreach-automation-design.md` (human-sends-from-Gmail model; never built)

## Intent

Exec outreach to prospective clients is the bottleneck. Today each exec cold-contacts 20-30 organizations from a spreadsheet and gets 2-3 replies (~10%). Contact info is patchy and often the wrong channel. The club wants to reach many more clients, especially **for-profit startups and small Bay Area companies** (nonprofits can't fund donations), and to expand beyond strategy consulting into tech and med-tech consulting niches.

Build a pipeline inside the portal that takes a list of researched prospects and then runs on its own: verify contacts, write personalized emails, send them slowly from a dedicated sender, follow up, detect replies, and pull execs in only when a human is needed. The portal should end up replacing the outreach spreadsheet (see memory: portal fully replaces the quarterly Excel tracker).

## Goals

- Send personalized first emails and follow-ups with no exec involved until a prospect engages.
- Every email carries the discovery-call booking link (`/services/book`) so a prospect can self-book.
- Forward every prospect reply to all execs.
- Protect the domain's reputation: slow, capped, randomized sending with automatic brakes.
- Track every prospect's stage in the portal; the portal is the source of truth instead of the spreadsheet.
- Be legally compliant (CAN-SPAM) and respect opt-outs permanently.

## Non-goals (v1)

- Automated discovery of organizations. v1 discovery is manual: an exec runs a research prompt in Claude Research and uploads the CSV. The import boundary is the seam where automated discovery (Gemini grounding, Apollo, site scraping) plugs in later without changing anything downstream.
- AI writing replies to prospects. Humans reply.
- Showing full reply history or a threaded inbox inside the portal.
- Multichannel outreach (LinkedIn, forms, phone).
- A/B testing, CRM integrations, live Google Sheets sync.

## Anti-goals (would make this a failure even if it technically works)

- Burning the sending domain, or getting the Resend account suspended (which would also kill booking confirmations and reminders).
- Emails that read as mass-mailed templates, or that state anything about a company that isn't true.
- Sending to someone who opted out, bounced, or already booked.
- A prospect replying and nobody noticing.

## Decisions made with the user

- **Discovery v1:** the user runs a Claude Research prompt and uploads the CSV. Automated discovery comes later.
- **Send method:** Resend, on a dedicated outreach subdomain, with a sender identity separate from "180DC Recruitment".
- **Sender identity:** the team as a whole (e.g. "180 Degrees Consulting at UCSC"), not a named exec.
- **Pace:** slow and spread out so no caps are hit; adjustable.
- **Human review:** none per email, once the system has been tested and the output looks good.
- **Replies:** every reply is forwarded to all execs.
- **Mailing address for the footer:** 1156 High St, Santa Cruz, CA 95064 (stored as a setting). User confirmed this is the club's official address.
- **Resend account and domain:** the existing Resend account (domain `ucsc180dc.org`) is used; no second account. Outreach uses the subdomain `partners.ucsc180dc.org` (user chose a professional name over `hello`; sender `180 Degrees Consulting at UCSC <team@partners.ucsc180dc.org>`, Reply-To `replies@partners.ucsc180dc.org`). Reasons for a subdomain: (reputation isolation, and an MX record for inbound replies that won't affect any real inboxes on the root domain). Resend's domain-count limit on the user's plan is unverified.
- **Outside rules:** the user says there are no 180 Degrees Consulting national rules restricting cold outreach.
- **Target market:** for-profit startups and small Bay Area companies first; nonprofits remain in scope. Niches: strategy, tech, med-tech consulting.

## Constraints

- Stack: Next.js (this repo's version has breaking changes; read `node_modules/next/dist/docs/` before writing code), Supabase (RLS, `is_exec()`), Vercel crons (UTC-only; existing pattern uses a Pacific-hour guard), Resend plus existing `nodemailer` Gmail path in `src/lib/email/`.
- Portal UI must follow `docs/ui-rulebook.md` (theme tokens, one main button per page, status as a word in a chip, details in a side panel, two navigation levels). This applies to all visual changes; see "Portal UI" below.
- AI runs on free-tier models (Gemini Flash-Lite, Groq fallback) behind `src/lib/assistant/provider.ts`; respect quota.
- Resend's acceptable use policy bans mass, non-personalized, unsolicited mail and requires complaint rate < 0.08% and bounce rate < 4%. Personalized one-to-one cold outreach is a gray area, so the system must stay clearly personalized and low volume.
- Existing booking rules: one confirmed meeting per client email; the page only accepts bookings while `client_meeting_booking_open` is true.

## Pipeline

Each prospect moves through these stages (shown in the portal as a word in a chip):

`new → verified → drafted → queued → sent → follow-up 1 → follow-up 2 → closing note → no response`

Exit states, reachable from any stage: `replied`, `booked`, `unsubscribed`, `bounced`, `invalid`, `needs attention`.

### 1. Import

- Exec uploads a CSV. Columns (we supply the research prompt that produces them): company, website, what they do, size, stage/funding, niche (strategy / tech / med-tech / other), contact name, contact role, contact email, "why they'd need consulting", and source URLs.
- Preview before commit: detected columns, duplicates (same email or same company), invalid rows. Skips anyone in `clients` (past clients) or already in the pipeline, and anyone on the suppression list.
- Re-import is idempotent.

### 2. Verify

- Syntax check, domain has MX records, not a disposable domain, flag role inboxes (`info@`), flag free-mail domains for a company contact.
- Failing rows become `invalid` with a reason. They are never sent to.
- Verification is only as good as free checks allow; the real safety net is the bounce brake below. A paid verifier can be added behind the same interface.

### 3. Draft

- One AI call per prospect, given: the prospect's CSV facts (with sources), the club's facts from a single editable source file (services, what a project looks like, outcomes, honest scope of a student consultancy), the relevant niche angle, and the booking link.
- Rules, enforced in the prompt and checked after generation: short plain text; opens with something specific and true to this company; states no fact that isn't in the supplied data; one low-friction ask (a 30-minute discovery call via the booking link); varied structure across a batch; no hype or fake urgency; never claims to be a person.
- Near-duplicate check across the batch regenerates similar drafts.
- If the data has no real specific fact, mark `needs attention` rather than writing generic copy.
- Signed as the team, e.g. "The 180 Degrees Consulting UCSC team".

### 4. Send

- Provider: Resend, from an outreach subdomain (name decided by builder with the user; the DNS records are the user's task). Same Resend account as booking confirmations (user's decision), so isolate by subdomain and a separate API key, and flag the residual account-level risk (a suspension would stop confirmations too).
- Cron-driven queue. Each tick picks due messages, honors: weekday business hours Pacific, a per-day cap, a minimum randomized gap between sends, and no more than one email per company domain at a time.
- Ramp (my call, adjustable in Settings): 5-10/day for the first two weeks, then increase gradually toward ~30-40/day over 4-8 weeks as long as health metrics stay clean.
- Every email includes: team sender name, honest subject, the booking link, a visible unsubscribe line, `List-Unsubscribe` and `List-Unsubscribe-Post` (one-click) headers, and the footer postal address.
- **Brakes:** the sender pauses automatically and notifies execs if rolling bounce rate or complaint rate crosses a conservative threshold (well under Resend's 4% / 0.08%), if Resend returns an account-level error, or if the global pause switch is on. It also pauses while `client_meeting_booking_open` is false, since the email promises a booking link.

### 5. Follow-ups

- Default sequence (my call, based on vendor data that ~58% of replies come from the first email): follow-up 1 at about day 4, follow-up 2 at about day 9, a short closing note at about day 15. Counted in business days, adjustable.
- Each follow-up is a fresh short message, not "just bumping this". Drafted when due and sent through the same queue and brakes.
- Sequence stops immediately on reply, booking, unsubscribe, bounce, or manual stop.

### 6. Replies and escalation

- Outgoing mail sets `Reply-To` to an address on the outreach subdomain. That subdomain's MX record points to Resend inbound. Do **not** put the MX record on the root domain.
- Resend `email.received` webhook (verified signature) hits a portal route; the route fetches the full message via the Resend Receiving API, matches it to a prospect (by thread/address), and:
  1. stops the prospect's sequence,
  2. classifies the reply (interested / question / not interested / unsubscribe request / out-of-office / other),
  3. **forwards the message to all execs** (email with the prospect, the original message, the classification, and a link to the prospect in the portal; `Reply-To` of the forward is the prospect so execs can answer them directly),
  4. sets the prospect to `replied` (or `unsubscribed` / paused for out-of-office, which resumes the sequence after the stated return date or a default delay).
- Unsubscribe requests and clear "stop"/"not interested" replies add the address and its domain's contact to the permanent suppression list, immediately, without waiting for human action.
- Bounce and complaint events from Resend's delivery webhook mark `bounced` and feed the brakes.
- Booking: the booking link carries a prospect token so `client_meetings` creation marks the prospect `booked` and cancels pending sends; also match by email as a fallback.
- Execs are notified on: any reply, any booking, a tripped brake, a prospect in `needs attention`. Notification is email now; portal shows an "attention" count.

## Data model (sketch; builder owns exact schema)

- `outreach_prospects`: company, website, niche, size/stage, facts (jsonb with source URLs), contact name/role/email, `status`, verification result, `next_send_at`, `step`, `booking_token`, timestamps, `created_by`.
- `outreach_messages`: prospect, step, subject, body, status (`draft | queued | sent | failed`), Resend message id, `sent_at`.
- `outreach_events`: opens are NOT tracked. Events: delivered, bounced, complained, replied, unsubscribed, booked.
- `outreach_suppressions`: email and/or domain, reason, timestamp. Checked before every send, including future imports. Permanent.
- Settings in `org_settings` (existing pattern): global pause, daily cap, ramp schedule, sending window, sender name, postal address, brake thresholds, follow-up delays.
- RLS: execs only (`is_exec()`).

## Portal UI (`/portal/outreach`)

**Every visual change to the portal, in this feature and any follow-up, must align with `docs/ui-rulebook.md`** (as required by `AGENTS.md`): theme tokens only, one main button per page, status as a word in a chip, details in a side panel, two navigation levels. The builder reads the rulebook before touching any screen under `src/app/portal` and runs the section 10 checks before calling the work done. The outreach section must fit into the existing navigation without adding a third level. This also covers the Settings additions and any email-health or attention indicators.
- Pipeline list with stage chips, filters (stage, niche), counts; details of a prospect in a side panel (facts, sent messages, replies, timeline).
- One main button per page (Import on the list).
- Health strip: sent today vs cap, bounce rate, complaint rate, sender status (running / paused / braked).
- Settings panel for pace, window, pause, sender name, address, sequence timing.
- Test tools: dry run (generate, never send) and "send to execs only" mode.

## Rollout and testing

1. **Dry run:** import a small CSV, generate drafts, nothing sends. Execs read the drafts and the sources behind them.
2. **Exec-only send:** all emails go to exec inboxes instead of prospects, to check rendering, headers, spam placement (Gmail, Outlook), links, reply forwarding, unsubscribe.
3. **Pilot:** 10-20 real prospects at the starting cap, watched daily.
4. Then ramp.

Automated tests: CSV parsing and dedupe; verification rules; scheduling (caps, windows, jitter, one-per-domain); sequence stopping on every exit state; suppression honored on send and import; brake triggers; webhook signature verification; reply matching and forwarding; unsubscribe header and link; booking-to-prospect linking; draft rule checks (claims traceable to data, no near-duplicates).

## Left to the builder

Table and column names, queue mechanics, exact brake thresholds, classification prompt, email templates and visual design of the footer, how the research prompt is worded (deliverable: a prompt the user can paste into Claude Research).

## Open items / risks

- **Resend policy risk:** the acceptable-use language is a gray area for cold outreach. Mitigation: personalization, low volume, dedicated subdomain/key, brakes. The fallback is the existing Gmail path from a dedicated outreach mailbox.
- **Draft accuracy** on free-tier models is the main quality risk; mitigated by source-only claims, the dry run, and `needs attention` for thin data.
- **Reply rate expectations:** vendor benchmarks put cold email at roughly 1-5% (well-run 8-15%); the current ~10% is from hand-picked, hand-sent outreach. Success should be measured in booked discovery calls, not sends.
- **Subdomain assumption:** if the user insists on sending from the bare `ucsc180dc.org`, inbound replies cannot use an MX record there without disrupting existing mail; use a Reply-To on a subdomain instead, and accept that complaints then hit the main domain's reputation.
- **DNS and domain setup** (SPF, DKIM, DMARC, MX for inbound) must be correct before the first send; fixing it mid-warm-up resets reputation.
- **Postal address:** CAN-SPAM requires one; the user confirmed 1156 High St is the club's official address.
- Data from vendor blogs (warm-up schedules, cadence, penalty amounts) was not verified against primary sources; treat as defaults to tune.
