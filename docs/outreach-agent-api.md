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

## The rules the API enforces

- Only emails published in a public source. Every row needs `emailSourceUrl` (https) and `emailEvidence` ∈ `published_on_site | published_directory | published_filing | published_other`. `published_on_site` must be a page on the company's own site. Otherwise `no_source`.
- No free-mail addresses (`free_mail`), no role inboxes like sales@ / careers@ (`role_inbox`); a named person, founders@, hello@, contact@, info@ are fine.
- Same checks as the CSV import: syntax, MX, do-not-contact list, duplicate email/company, past clients.
- At least one fact with an https source (`no_facts`). The email's source is stored as a fact too.
- Skip reasons: `duplicate_email duplicate_company past_client suppressed invalid_email no_source no_facts mx_failed free_mail role_inbox quota backlog_full invalid_row`.
- `quotaToday` = daily target − prospects accepted today, and 0 while more than 120 prospects wait to be sent. Mode `off` accepts nothing.

## Kill switch

Revoke the key (instant), or untick "Let the research agent add prospects", or pause outreach. None needs a deploy.
