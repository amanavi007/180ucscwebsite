# Outreach Automation — Design

Date: 2026-10-07
Status: Draft for review

## Goal

Make exec's lives easier by letting the portal assistant run the client-outreach grind. An exec imports the outreach list (org name + contact info), and the assistant researches each org, finds a valid contact, writes a personalized email, and gets it into the exec's Gmail for them to send. The goal is to reach many more prospective clients with less manual effort, while keeping a real person responsible for every email that goes out.

This also moves us toward the portal fully replacing the Excel outreach tracker (see "Internal tool vs. tracker").

## Principles (agreed in brainstorming)

1. **A human sends every email.** The assistant drafts; the exec reviews and presses Send in their own Gmail. The assistant never sends.
2. **Emails are signed by the real exec** who will send them (drafted by the assistant, owned by the exec). No invented persona. "Casey" may exist as the assistant's internal name in the portal only.
3. **Personalized per org, not templated.** Each email references something specific and true about the org, with sources shown to the reviewer. No fabricated facts.
4. **Sending identity is the exec's own 180 Google Workspace account**, not Resend or a bulk sender, for best deliverability and so replies land where execs already work.
5. **Statuses are tracked, not guessed.** Phase 2 reads the inbox (narrowly) to detect sent, replied, and bounced.

## Phasing

- **Phase 1 — Core pipeline (no Google integration):** import, research, contact finding/verification, personalized drafts with sources, review queue, "Open in Gmail" compose links, manual status marking.
- **Phase 2 — Gmail integration:** "Connect Gmail" button (OAuth) that writes drafts into the exec's Drafts folder and reads relevant inbox threads to detect sent / reply / bounce automatically, with bounce recovery.

Phase 1 is useful on its own and ships first. Phase 2 reuses all of Phase 1's data and UI.

## Data model (Supabase migration)

`outreach_prospects`
- `id`, `org_name`, `website_url` (nullable), `source_row` (jsonb: original CSV columns, unmapped fields kept)
- `owner_id` (exec responsible for the row; set at import or assignment)
- `status`: `new | researching | needs_context | drafted | approved | sent | replied | meeting_booked | declined | bounced | do_not_contact`
- `research` (jsonb: summary, claims[], each `{text, source_url}`), `researched_at`
- `last_contacted_at`, `next_followup_at`, `follow_up_step` (0–2)
- `created_at`, `updated_at`

`outreach_contacts` (one prospect → many candidate contacts)
- `prospect_id`, `name`, `role`, `email`, `source_url`, `confidence` (`named_role | named_generic | generic_inbox`)
- `checks` (jsonb: `format_ok`, `mx_ok`, `disposable`, `role_account`), `state`: `candidate | primary | bad | opted_out`
- `bad_reason` (e.g. `bounced`, `no_mx`)

`outreach_messages`
- `prospect_id`, `contact_id`, `step` (1 first touch, 2–3 follow-ups), `subject`, `body`
- `status`: `draft | approved | in_gmail | sent | failed`
- `claims_used` (references into the research claims, shown to the reviewer)
- `gmail_draft_id`, `gmail_thread_id` (Phase 2), `sent_at`, `approved_by`, `approved_at`

`outreach_gmail_connections` (Phase 2)
- `user_id`, `google_email`, `refresh_token` (encrypted), `scopes`, `connected_at`, `last_sync_at`, `revoked_at`

RLS: exec roles only (use `isExec` from `src/lib/auth/roles`). Execs see all rows; `owner_id` drives defaults and filters, not secrecy. Refresh tokens are only readable by server code with the service role.

## Phase 1 detail

### Import
- CSV upload (exported from the Google Sheet). Preview shows detected column mapping, duplicate rows (same org or email), and invalid emails before anything is written. Unmapped columns are kept in `source_row`.
- Re-import is idempotent: rows matching an existing org (case-insensitive name or same email) are skipped or merged, never duplicated.

### Research and contact finding
Runs as a **batch job per prospect**, not inside the live chat loop, because the assistant runs on free-tier models (Gemini Flash-Lite, Groq fallback) with tight rate limits and because grounded search tools generally cannot be mixed with function tools in one call.

- Steps per prospect: (1) find/confirm the org's website, (2) fetch homepage, about, team, and contact/partnerships pages, (3) extract a short factual summary with source URLs, (4) extract candidate contacts, (5) run checks, (6) pick the primary contact.
- Web access: Gemini Google Search grounding for discovery and a server-side fetch for reading pages. Provider choice stays behind `src/lib/assistant/provider.ts`; the research code asks for a "research-capable model" and does not name a vendor elsewhere.
- Concurrency and quota: a small worker processes a queue (a Vercel cron tick plus an on-demand kick from the UI), a few prospects at a time, honoring `quota.ts`. Prospects show `researching` while queued. Execs can run research for 10 rows now rather than the full list.
- **Contact preference order:** a named person in a relevant role (executive director, partnerships, programs, operations, founder) found on the org's own site > a named person with a published email > a generic inbox (`info@`, `contact@`). Role-based generic inboxes are allowed but marked lower confidence.
- **Validity checks (free):** email syntax, domain has MX records, not a known disposable domain, flagged if role account. Anything failing a hard check is marked `bad` and not used. A paid verification API can be added later behind the same `checks` interface if bounce rates warrant it.
- We make no promise of zero bounces. Phase 2 bounce recovery is the safety net; in Phase 1 execs mark bounces manually.
- **No faking context:** if no solid, sourced fact is found, the prospect becomes `needs_context` and no draft is written until an exec adds a note or confirms a generic approach.

### Drafting
- One dedicated drafting call per prospect, given: the sourced research claims, the primary contact, the sending exec's name and role, and a fixed set of 180DC facts (services, what a project looks like, outcomes) from a single source file that execs can edit. It is **not** given a script.
- Rules enforced in the prompt and checked after generation: plain text; short; uses at least one sourced org-specific claim; does not state anything absent from `claims_used`; ends with a low-friction ask. Structure, openers, and length are varied across a batch, and a similarity check against the batch's other drafts regenerates near-duplicates.
- Follow-ups (steps 2–3) are drafted when `next_followup_at` passes and the prospect is still `sent` with no reply. They go into the same review queue; nothing is auto-approved.
- Do-not-contact, bounced, replied, declined, and booked prospects are never drafted.

### Review queue — `/portal/outreach`
- Pipeline table: filter by status and owner; bulk actions.
- Review view: one draft at a time with the contact (and why it was chosen), the sources behind each org-specific line (highlighted in the body), inline edit, Approve / Skip / Regenerate / Change contact.
- "Due today" section: follow-ups and new drafts waiting for review.
- **Open in Gmail** on an approved draft: opens `https://mail.google.com/mail/?view=cm&fs=1&authuser=<exec 180 email>&to=…&su=…&body=…`. If the encoded body would exceed a safe URL length, the button copies the body to the clipboard and opens a compose window with only recipient and subject.
- Manual status actions: Mark sent, Replied, Meeting booked, Declined, Bounced, Do not contact. Marking sent sets `last_contacted_at` and `next_followup_at` (default +5 business days for step 2, +10 for step 3).

### Assistant tools (exec-only)
- `outreach_import_preview` / `outreach_import_commit`
- `outreach_research` (queue research for chosen or all `new` rows)
- `outreach_draft` (draft for researched rows; returns counts and the `needs_context` list)
- `outreach_status` (read: pipeline counts, who is due, who has not replied)
- `outreach_mark` (sent / replied / booked / declined / bounced / do_not_contact)
Bulk writes go through the existing proposal + confirm-popup flow (`proposals.ts`). Tools follow the existing `tools/` layout and compact model-facing output conventions. The assistant has no tool that sends email.

## Phase 2 detail — Gmail integration

### Connect Gmail
- Standard Google OAuth consent flow from a "Connect Gmail" button. Scopes: `gmail.compose` (create drafts) and `gmail.readonly` (read threads for status detection). Offline access to get a refresh token, stored encrypted.
- Requested via a Google Cloud project owned by the club. Exact consent-screen configuration (testing vs. production, unverified-app warning, user cap, token lifetime behavior) must be re-checked against Google's current docs before building. This is a known unknown; see Risks.
- Each exec connects their own account. Disconnect revokes the token and deletes the stored connection.

### Drafts into Gmail
- Approving a message creates a real draft in the exec's Drafts folder (`gmail.users.drafts.create`) with To, Subject, Body, and stores `gmail_draft_id`. The message becomes `in_gmail`. "Open in Gmail" remains as the fallback and for non-connected execs.

### Inbox reading (narrow by design)
- A cron polls each connected account every ~15 minutes, looking only at: (a) threads involving addresses of prospects in `sent`/`in_gmail` states, and (b) delivery-failure notices (`mailer-daemon` / `postmaster`) mentioning those addresses.
- Detects: draft was sent (message appears in Sent for the thread) → `sent`, sets follow-up clock; a reply from the prospect's domain → `replied`, stops the sequence; a bounce → `bounced`.
- Stores only statuses, ids, and timestamps. **Email bodies are not stored.** Reply content is not shown in the portal in v1 (execs read replies in Gmail).
- Out-of-office and auto-replies are not treated as replies when detectable by headers (`Auto-Submitted`, `X-Autoreply`).

### Bounce recovery
- On bounce: mark that contact `bad`, set the prospect back to `researching`, rerun contact finding excluding bad addresses, and queue a fresh draft for review. After two failed contacts the prospect becomes `needs_context` for a human.

## Error handling

- Research fetch failures, timeouts, and blocked sites mark the prospect `needs_context` with a short reason, never silently skip it.
- Model rate limits (429) retry later via the queue; the existing provider fallback applies.
- Gmail API failures leave the message `approved` with an error, and "Open in Gmail" still works.
- Token revoked or expired: connection flagged in the UI, polling stops for that account, execs get a reconnect prompt.
- Import and tool inputs validated with zod, matching `proposal-actions` conventions.

## Testing

- Unit: CSV parsing/mapping/dedupe; contact preference ordering and validity checks; follow-up scheduling; status transitions; Gmail compose URL builder including the length fallback; bounce-notice parsing; reply and auto-reply classification; proposal actions.
- Draft quality: a live test alongside `tool-selection.live.test.ts` asserting each draft contains at least one claim traceable to the research, makes no unsourced claims, and that a batch has no near-duplicates.
- Gmail layer: mocked Gmail API in tests; a manual end-to-end check with one real exec account before rollout.

## Out of scope for v1

Automatic sending, Resend/bulk sending, paid email verification (hook left in), showing reply contents in the portal, A/B testing, live Google Sheets sync, CRM integrations, and multi-language outreach.

## Risks and open items

- **Google OAuth app limits** (unverified-app warning, user cap, token lifetime for restricted scopes) must be verified against current Google docs before Phase 2. If execs' accounts are blocked by Workspace policy, an admin must allow the app; Phase 1 does not depend on this.
- **Research accuracy** on a small free-tier model is the biggest quality risk. Mitigation: mandatory source links, the claims-only rule, and human review. If quality is poor, the research step can be pointed at a stronger model through the provider layer without other changes.
- **Quota/cost:** research is several model calls per org. Batch size and cadence are throttled via the existing quota module; the first rollout should be a small pilot batch.
- **Deliverability** is not guaranteed; low-volume personalized plain-text sent from real exec inboxes is the best available mitigation.
- **Privacy/consent:** Phase 2 inbox access is opt-in per exec, narrowly scoped, and stores no email content. Execs should be told exactly what it reads before connecting.
- **Contact data** comes from public org pages only; the do-not-contact flag is honored everywhere.
