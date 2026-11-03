# Outreach discovery: find companies automatically

Date: 2026-11-03
Status: Approved in conversation; building
Extends: `2026-10-22-automated-outreach-design.md` (the CSV import was the seam; discovery plugs in there)

## Intent

Nobody should have to run a research prompt and upload a CSV. A daily job finds companies that fit the club's target market, reads their own websites, and adds them as `new` prospects. Verify, draft, send and follow-up already take it from there.

## Goals

- Add roughly 10 well-fitting, email-reachable prospects a day with no human step.
- Every fact a draft may state comes from a named source (the directory entry or the company's own page).
- Only email addresses published on the company's own domain are used. Never guessed.
- Show execs what was found and what was skipped, and why, in the portal.

## Non-goals (v1)

- Web-search discovery. This free setup has no search tool: Gemini grounding is closed on the free key, Groq's search models are unavailable, BayLeaf allows only open-weight models. The source interface leaves room for a Tavily/Brave adapter (needs a user-created API key).
- Guessing emails, paid email finders, contact forms.
- AI-extracted facts. Directory data and meta descriptions only, so nothing can be invented.

## Anti-goals

- Emailing someone who opted out, is already a prospect, or is a past client.
- Hammering small company sites. The crawler obeys robots.txt, identifies itself, caps pages per company, and is time-boxed per run.
- Filling the pipeline faster than it can send.

## Source: Y Combinator dataset

`https://yc-oss.github.io/api/companies/all.json` (open, updated daily, ~6,400 companies, ~10 MB, no key). Filter: `status = Active`, a location in the configured Bay Area cities, `team_size` at or under the configured maximum, an industry in the configured list, has a website. Newest batches first. Measured on a 40-company sample: 60% publish an on-domain email.

Each candidate becomes at most one row in `outreach_discovery_candidates` (unique by domain), so no company is evaluated twice.

## Per-candidate flow

1. Skip if the domain or any candidate email is already a prospect, suppressed, or a past client (outcome `duplicate`).
2. Fetch the home page and up to five likely pages (`/contact`, `/about`, `/team`, `/company`, `/contact-us`) after checking robots.txt. Nothing reachable: `unreachable`.
3. Collect emails on the company's own domain. Drop role inboxes that are not for business (`careers`, `jobs`, `security`, `support`, `sales`, `press`, `privacy`, `legal`, `abuse`, `billing`, `noreply`, ...). Prefer a named inbox, then `founders`, `hello`/`hey`/`hi`, `contact`/`team`, `info`. None left: `no_email`.
4. Build facts: directory one-liner, directory description, "Team of N in <city>", "Y Combinator <batch>", and the site's meta description, each with its source URL. No usable fact: `no_facts`.
5. Insert the prospect as `new` (summary, size/stage, niche from industry: Healthcare is `med-tech`, everything else `tech`). Outcome `added`.

## Pacing and safety

- Target per day (default 10), attempts capped per run, run time-boxed (about 4 minutes).
- Skips the run when the unsent backlog (`new`, `verified`, `drafted`) is above three times the daily cap.
- Does nothing unless discovery is switched on in Settings. Independent of the send mode: in test modes nothing reaches a company.
- Prospects are created by the exec who switched discovery on.

## Settings (org_settings keys)

`outreach_discovery_enabled`, `outreach_discovery_per_day`, `outreach_discovery_regions`, `outreach_discovery_industries`, `outreach_discovery_max_team`, `outreach_discovery_enabled_by`.

## Portal

`/portal/admin/outreach/discovery`: a status strip (on or off, found today against the target, last run), a list of recent candidates with the outcome as a chip and the reason, details in the side panel (facts, source links, the email chosen and where it was found). One main button: "Find companies now". Follows `docs/ui-rulebook.md`.

## Schedule

New cron `/api/cron/outreach-discover`, two UTC entries for the Pacific-hour guard, 6am Pacific, before the 7am prepare job.

## Left to the builder

Exact role-inbox word list, page-fetch limits, table columns, the facts' wording.
