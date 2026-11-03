# Outreach agent API

The door for an external research agent (Muse) into the outreach pipeline. It supplies researched, sourced prospects; sending, pacing and brakes stay in the website. Spec: the "Outreach agent integration" brief of 2026-11-03.

Base URL: `https://www.ucsc180dc.org/api/agent/outreach`. HTTPS only, no CORS.
Auth: `Authorization: Bearer 180agent_…` (a key made in Admin → Outreach → Settings → Research agent; shown once). Wrong, missing or revoked key: `401 {"error":"unauthorized"}`. `403 agent_disabled` when the master switch is off, `403 missing_scope`, `429 rate_limited` (60 calls a minute per key).

| Call | Scope | What it does |
| --- | --- | --- |
| `GET /context` | `outreach:read` | Mode, targets, backlog, `quotaToday`, counts, and the exclusion lists (prospect/suppressed domains and emails, past client names). |
| `POST /prospects` | `outreach:submit` | Batch of up to 50 net-new prospects with a `batchId` (uuid). Per-row `accepted` / `skipped` + reason. Repeating a `batchId` returns the first answer and adds nothing. `409 batch_in_progress` if the first call is still running. |
| `GET /tasks?claim=N` | `outreach:enrich` | Leases up to N (default 20, max 25) discovery companies with no published email, for 24 hours. |
| `POST /tasks/:id/result` | `outreach:enrich` | Answer for a leased company: a contact (`claimToken`, `contactEmail`, `emailSourceUrl`, `emailEvidence`, `facts`) or `{claimToken, outcome:"not_found", reason, detail}`. `409` for a wrong token or an expired lease; `422 {status:"rejected", reason}` when the contact fails the rules (the lease stays). |
| `POST /runs` | `outreach:read` | End-of-run report and heartbeat (also for failed runs: `detail.error`). Feeds the "Research agent" line on the health strip. |

## Audit access (scope `outreach:audit`)

For a one-time or periodic audit of the whole discovery database. Give a key this scope in Admin → Outreach → Settings → Research agent ("Audit access" when making a key, or "Allow audit access" on an existing one). Existing keys have no audit scope until you do. Every call below needs the scope, the master switch on, and counts toward the 60 calls a minute. Without the scope: `403 missing_scope`; switch off: `403 agent_disabled`.

**Reads never use up attempts.** Claims through `GET /tasks` still burn one of a company's 3 agent attempts; `GET /candidates` does not touch them.

| Call | What it does |
| --- | --- |
| `GET /stats` | `candidatesByOutcome` (every outcome actually stored), `candidatesTotal`, `prospectsTotal`, `prospectsByStatus`. |
| `GET /candidates` | Every stored field of the discovery candidates. Filters: `outcome`, `source`, `since` (ISO time). `payload` is returned verbatim (`null` stays `null`): for ready companies it holds the pooled prospect with its facts and their sources. Also returns `agentAttempts`, `agentClaimedAt`, `agentLastReason`, `repairAttempts`, `lastAttemptAt`; `updatedAt` is always `null` (candidates have no such column). |
| `GET /prospects` | Prospects: `company`, `website`, `domain` (of the website), `contactDomain`, `segment`, `niche`, `contactName`, `contactRole`, `contactEmail`, `status`, `createdAt`, and `facts` as `[{text, sourceUrl}]`, exactly what drafting reads. Filters: `status`, `since`. |
| `PATCH /candidates/:id` | Corrects a moved website. Body `{website, evidenceUrl, note}`. See below. |
| `POST /candidates/:id/facts` | Adds sourced facts to a `ready` or `added` company. Body `{facts:[{text, sourceUrl}]}` (1–12). Returns `{added, rejected, factsTotal}`. |
| `POST /candidates/:id/requeue` | Hands a fixed company back to discovery's repair job. Body `{note?}`. |

Lists use cursor paging: `?limit=` (default 100, max 200) and `?cursor=` (opaque). The answer is `{rows, nextCursor}`; `nextCursor` is `null` on the last page. Order is `createdAt`, then `id`, so a full sweep is stable while rows change. Bad parameters: `400 invalid_limit | invalid_cursor | invalid_since | invalid_outcome | invalid_source | invalid_status`.

**`PATCH /candidates/:id`**
- `website` must be an https URL on a company's own domain (not LinkedIn, GitHub, YC and the like); `evidenceUrl` an https page (the new site, or a directory or press page) whose content mentions the company name; `note` says why (up to 400 characters). `400 invalid_website | invalid_evidence_url | invalid_body`.
- `409 {"error":"domain_taken","conflictingCandidateId"}` when another candidate already has the new domain. Nothing changes.
- `422 {"error":"evidence_mismatch"}` when the evidence page can't be fetched or doesn't mention the company. Nothing changes.
- On success the website and domain change. A company that was `unreachable`, `error` or `failed` goes back to `unreachable` and one that was `no_email` stays `no_email`, with repair tries and agent attempts at zero, the lease cleared and the reason set to "Website corrected by research agent: <note>"; discovery's repair job looks at it again on its next run. Other outcomes (`added`, `ready`, `duplicate`, `no_facts`) keep their outcome and prospect link; only website and domain change (a `ready` company's pooled payload follows).
- The change is written to the agent activity log (`kind: "correction"`) and shows under "Recent audit changes" on the settings card.

**`POST /candidates/:id/facts`**: the same rules as facts on a prospect: https sources only (others count as `rejected`), duplicates of existing fact text (ignoring case and spacing) add nothing. Facts go where drafting reads them: the linked prospect once there is one, and the pooled payload. The contact email and the outcome never change here. `409 facts_not_applicable` for other outcomes.

**`POST /candidates/:id/requeue`**: same reset as the website fix, without touching the website. Works for `unreachable`, `error`, `failed` and `no_email`; `409 not_requeueable` for anything else (including `added`). Emails still only arrive through `/tasks/:id/result` and `/prospects`, with all the checks below.

Not available to the agent, by design: raw database access, deletes, settings changes, anything about sending, drafting, suppression or do-not-contact (read-only through `/context`).

## The rules the API enforces

- Only emails published in a public source. Every row needs `emailSourceUrl` (https) and `emailEvidence` ∈ `published_on_site | published_directory | published_filing | published_other`. `published_on_site` must be a page on the company's own site. Otherwise `no_source`.
- No free-mail addresses (`free_mail`), no role inboxes like sales@ / careers@ (`role_inbox`); a named person, founders@, hello@, contact@, info@ are fine.
- Same checks as the CSV import: syntax, MX, do-not-contact list, duplicate email/company, past clients.
- At least one fact with an https source (`no_facts`). The email's source is stored as a fact too.
- Skip reasons: `duplicate_email duplicate_company past_client suppressed invalid_email no_source no_facts mx_failed free_mail role_inbox quota backlog_full invalid_row`.
- `quotaToday` = daily target − prospects accepted today, and 0 while more than 120 prospects wait to be sent. Mode `off` accepts nothing.

## Kill switch

Revoke the key (instant), or untick "Let the research agent add prospects", or pause outreach. None needs a deploy.
