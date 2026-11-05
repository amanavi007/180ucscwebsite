# Outreach UI revamp: design

Mockups (option A "Today" + option C "Settings"): https://claude.ai/artifact/YExmCMcbdrFwCUAJdMS5aT (boards `Main` and `Settings`; the `Board` option was rejected).

## Intent

The outreach section works but the owner is lost navigating it. The same companies appear in four places (Prospects, Schedule, Discovery, the reply panel), nothing says what to do first, and Settings is organised by system parts, not by the questions an officer asks. The revamp changes layout and navigation only. Pipeline behaviour (verify, draft, send, follow up, replies, discovery) does not change.

## Goals

- Opening Outreach answers "what do I need to do right now?" in one glance.
- Three views only, in the existing two-level nav: **Today, Companies, Settings**.
- Every company has one place to be found (Companies) and one panel to read it in.
- Settings reads top to bottom as plain questions: Is it on? How fast? Who sends? Follow-ups? Finding companies.
- Follows `docs/ui-rulebook.md`: theme tokens only, one lime button per page, status as a word in a chip, details in a side panel, two navigation levels.

## Non-goals

- No change to sending, drafting, discovery, heartbeat or reply logic, or to any database table.
- No kanban board (rejected: unreadable with ~1,100 found companies).
- No reply ownership, digest, or capacity-aware sending (still on the ideas list).
- No new inbox for composing replies; "Open reply" shows the existing reply snippet in the panel.

## Anti-goals

Failure even if it technically works: a fourth nav view, a second main button on a page, a status shown only by colour, or a setting that existed before and can no longer be reached.

## The design

### Navigation
`nav-links.ts` outreach group becomes Today (`/portal/admin/outreach`), Companies (`/portal/admin/outreach/companies`), Settings (`/portal/admin/outreach/settings`). The old Schedule and Discovery nav entries go away.

### Today (`/admin/outreach`)
Top to bottom:
1. Header: title, one lime button **Add companies** (opens the existing import dialog). "Generate drafts" and "Send test" are removed from the header (see Settings).
2. Slim status bar (one row, one card): mode chip, "N of cap sent today" with a forest meter, bounce rate, spam count, one chip "All daily jobs ran" or "N jobs need a look" with a Details link that opens the per-job lines (today's health-strip job list) in a side panel.
3. **Needs you** (left): replies not yet handled, stuck/failed drafts (`needs_attention`), bounced companies. Each row: chip (Reply / Stuck / Bounced), company, one-line reason, one text action (Open reply, Fix draft, Add another email). Each opens the Companies panel for that company. Empty state: "Nothing needs you."
4. **Going out today** (right): today's scheduled sends with time, company, step, sending officer, chip. A footer shows tomorrow's planned count and a link "See next days" to the existing Schedule page (kept as a sub-page reachable from here, not a nav view). Click a row to open its draft in the Companies panel.
5. **The whole pipeline**: clickable funnel strip Found, Drafted, Scheduled, Sent, Replied, Booked with counts; each links to Companies with that stage selected. Replied shows how many need an answer.

### Companies (`/admin/outreach/companies`)
One list, one search box, one row of stage chips: Needs you, Found, Drafted, Scheduled, Sent, Replied, Booked, Finished, Skipped (no email, unreachable, duplicate, from Discovery), with counts. Side panel opens beside the list. Existing behaviour carried over: checkbox multi-select with "Rewrite drafts", the Discovery "Add email by hand" form, "Not a duplicate", Stop / Resume / Never contact, the "Add company list" dialog. The page's one lime button is **Add companies**. "Generate drafts now" and "Find companies now" become outline buttons in the page header's overflow area (or quiet buttons beside the search), never lime.

### Settings (`/admin/outreach/settings`)
One scrolling page with a left table of contents (sticky on desktop, stacked on phones), one card per question:
- **Is it on?**: Off / Test mode / Live as three option cards, plus a Pause switch. In Test mode the card also holds "Send a test email now" (moved from the old header).
- **How fast?**: emails per day (empty means automatic), send-from and until hours.
- **Who sends?**: officer list with on/off switch, signature status and warnings (e.g. "no LinkedIn yet"), Edit per officer; single-sender fallback tucked under "Advanced".
- **Follow-ups**: follow-up days, closing note.
- **Finding companies** (marked Advanced): daily discovery switch, research agent (last run, keys).
One lime **Save changes** button per page.

### Redirects
- `/admin/outreach/discovery` redirects to `/admin/outreach/companies?stage=found`.
- `/admin/outreach?stage=...` (old Prospects deep links, e.g. from alert emails) redirects to `/admin/outreach/companies?stage=...`. Any code or email that links to `/admin/outreach` with a stage or prospect parameter is updated to point at Companies. Known places: `src/lib/admin-attention.ts` and its test (`?stage=needs-you`), `OUTREACH_PORTAL_PATH` in `src/lib/data/outreach.ts` (used by alert emails with `?prospect=`), `src/lib/email/outreach-emails.test.ts`, and `src/lib/admin-nav.test.ts` (nav labels). The redirect also forwards `?prospect=` so old emails still open the right panel.

## Constraints

- Next.js in this repo has breaking changes: read the relevant guide in `node_modules/next/dist/docs/` before writing routes, redirects or search-param code.
- Portal rulebook section 10 checks must pass; textareas and dialogs cap height and scroll (see the UI overflow rule); fix recurring problems in the shared component, the rulebook and a guard test, not per page.
- Phone widths must work (stacked cards, wrapped chips, tables in a scroll box).
- Data comes from the existing `getOutreachOverview` and discovery loaders; new derived values (needs-you list, today's sends, funnel counts) are pure functions in `src/lib/outreach/view.ts` with unit tests. No migrations.
- Existing tests keep passing; the two known `SnE Library` interview-email failures are unrelated.

## Decisions I made (for the owner to check)

1. **Schedule stays as a sub-page**, linked from Today, not a nav view, to keep three views.
2. **Phased Companies build.** Phase 1: one page with the stage chips; Found and Skipped chips render the Discovery candidate table inside the same page and panel (two loaders, one screen). Phase 2, only if wanted: a single merged data model. This avoids a risky data-layer rewrite for a UI fix.
3. "Send test" moves to Settings under Test mode; "Generate drafts" and "Find now" become quiet buttons on Companies.
4. Funnel "Booked" and "Finished" use the existing `STAGE_FILTERS` statuses; stage definitions in `view.ts` are regrouped but no status values change.
5. The health "Details" opens in a side panel (rulebook: details in a panel).

## Left to the builder

Component file layout, exact breakpoints, empty and loading states (per-route `loading.tsx` already exists for each outreach route), copy polish within the plain-words rule, and test structure.
