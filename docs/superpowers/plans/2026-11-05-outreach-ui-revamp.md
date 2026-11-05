# Outreach UI Revamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the four-page outreach section with three views (Today, Companies, Settings) that open on "what do I need to do now?".

**Architecture:** Pure view helpers in `src/lib/outreach/view.ts` and a new `src/lib/outreach/links.ts` (unit-tested) feed thin server pages. Today is a new server page. Companies is the existing prospect workspace moved to `/companies`, with one shared stage-chip bar that also switches to the Discovery candidate table for Found/Skipped. Settings becomes stacked question cards. No migrations, no pipeline logic changes.

**Tech Stack:** Next.js (breaking-change version: read `node_modules/next/dist/docs/` for routing, `redirect`, `searchParams` before writing pages), React, Tailwind theme tokens, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-05-outreach-ui-revamp-design.md` (mockups: https://claude.ai/artifact/YExmCMcbdrFwCUAJdMS5aT, boards Main and Settings).

## Global Constraints

- Read `docs/ui-rulebook.md` before touching any screen and run its section 10 checks before finishing: theme tokens only (no color names, hex), one lime (default) `<Button>` per page, status as a word in a chip, details in a side panel, two navigation levels.
- Plain, short words. Inline errors have no jokes.
- Textareas and dialogs cap height and scroll; fix recurring overflow bugs in the shared component, not per page.
- Phone widths work: cards stack, chips wrap, tables sit in a scroll box.
- Nothing under 12px text. Numbers use tabular numerals.
- No migrations, no change to sending, drafting, discovery, heartbeat or reply logic.
- Nav: exactly three outreach views, Today `/portal/admin/outreach`, Companies `/portal/admin/outreach/companies`, Settings `/portal/admin/outreach/settings`. Schedule stays at `/portal/admin/outreach/schedule` as a sub-page linked from Today, not in nav.
- Never `git add -A` (AGENTS.md); no Claude/Co-Authored-By attribution in commits (user's standing rule). Commit and push finished work to main.
- Known unrelated failures: 2 `SnE Library` interview-email tests.

## Review Focus

1. A replied company must count in both "Needs you" and "Replied" chips, and the Needs you total must equal the sum of reply + stuck + bounced rows. (Task 1)
2. Old links must still land somewhere useful: alert emails with `?prospect=<id>`, `?stage=needs-you`, `/discovery`, and a stale `?stage=` key from the old filter set (e.g. `not-sent`, `in-progress`, `stopped`). (Task 2)
3. Found/Skipped with more than one page of candidates keeps pagination, page size and search working inside the Companies page. (Task 4)
4. Today on a weekend, with outreach Off, or with zero prospects shows calm empty states, not blanks or crashes (e.g. no "Going out today" rows on Saturday; "Nothing needs you."). (Tasks 1, 3)
5. Every setting that was reachable before (agent keys, single-sender fallback, discovery switch, mode, pause, hours, cap, follow-ups, officers) is still reachable after the Settings regroup and one Save still persists all of them. (Task 5)

---

### Task 1: Stage model and Today helpers

**Files:**
- Modify: `src/lib/outreach/view.ts` (replace `STAGE_FILTERS`, keep `filterByStage`, `nicheOptions`, `stageChip`, `senderState` exports)
- Modify: `src/lib/data/outreach.ts` (`ProspectView` gains `senderId: string | null`; map `row.sender_id` in `getOutreachOverview`)
- Test: `src/lib/outreach/view.test.ts`

**Interfaces:**
- Produces:
  - `STAGE_FILTERS: { key: string; label: string; statuses: string[] }[]` with keys in this order and these statuses: `all` (none), `needs-you` (`replied`,`needs_attention`,`bounced`), `drafted` (`new`,`verified`,`drafted`), `scheduled` (`queued`), `sent` (`sent`,`follow_up_1`,`follow_up_2`,`closing_note`), `replied` (`replied`), `booked` (`booked`), `finished` (`no_response`,`unsubscribed`,`invalid`). Labels: All, Needs you, Drafted, Scheduled, Sent, Replied, Booked, Finished. (`needs-you` and `replied` intentionally overlap; the old "exactly one group" test is replaced.)
  - `DISCOVERY_STAGES = [{ key: "found", label: "Found" }, { key: "skipped", label: "Skipped" }]` and `isDiscoveryStage(key: string | null | undefined): key is "found" | "skipped"`.
  - `normalizeStage(key: string | null | undefined): string` returns a known prospect or discovery key, else `"needs-you"` when `key` is empty and `"all"` for unknown keys. Old keys map: `not-sent` to `drafted`, `in-progress` to `sent`, `finished` stays, `stopped` to `finished`.
  - `interface NeedsYouItem { prospectId: string; company: string; kind: "reply" | "stuck" | "bounced"; reason: string; actionLabel: "Open reply" | "Fix draft" | "Add another email" }`
  - `needsYouItems(prospects: Pick<ProspectView,"id"|"company"|"status"|"statusReason"|"contactEmail">[], replies: Pick<ReplyView,"prospectId"|"snippet"|"createdAt">[]): NeedsYouItem[]`: replies first (newest reply snippet, trimmed to 90 chars, as `reason`), then stuck (`needs_attention`, reason = `statusReason` or "Needs a look"), then bounced (reason = `"<contactEmail> did not accept the email"`). A `needs_attention` row whose reason is "Stopped by an exec." is excluded.
  - `interface TodaySends { items: { prospectId: string; company: string; step: number; at: string | null; state: "sent" | "scheduled" | "planned"; senderName: string | null }[]; left: number; tomorrow: number; windowLabel: string }`
  - `todaySends(schedule: Schedule, senderNameFor: (prospectId: string) => string | null, settings: Pick<OutreachSettings,"windowStartHour"|"windowEndHour">): TodaySends`: `items` = first day's items (empty if that day is a weekend with no items), `left` = items not `sent`, `tomorrow` = items length of the next non-weekend day (0 if none), `windowLabel` like `"9 AM to 4 PM"`.
  - `funnelCounts(prospects: {status: string}[], foundCount: number): { key: string; label: string; count: number; href: string }[]` for Found (count = `foundCount`, href `?stage=found`), Drafted, Scheduled, Sent, Replied, Booked, each href `/portal/admin/outreach/companies?stage=<key>`; counts via `filterByStage`.

- [ ] **Step 1: Write failing tests** in `view.test.ts`, replacing the "puts every status in exactly one group" test: `it("puts every status in at least one group")`; `it("counts a replied company in both needs-you and replied")` (`filterByStage(p,"needs-you")` and `filterByStage(p,"replied")` both contain `replied`; needs-you equals `["bounced","needs_attention","replied"]` sorted); `needsYouItems` cases: orders reply, stuck, bounced; excludes "Stopped by an exec."; empty input returns `[]`; reply reason trimmed to 90 chars; `normalizeStage("not-sent") === "drafted"`, `normalizeStage("stopped") === "finished"`, `normalizeStage(undefined) === "needs-you"`, `normalizeStage("bogus") === "all"`, `normalizeStage("found") === "found"`; `todaySends` with a Saturday-only schedule returns `items: []`, `left: 0`; with 3 items (1 sent) `left === 2`; `funnelCounts` Found uses `foundCount` and Replied counts only `replied`.
- [ ] **Step 2: Run** `npx vitest run src/lib/outreach/view.test.ts`. Expected: FAIL (missing exports).
- [ ] **Step 3: Implement** the exports above in `view.ts`, add `senderId` to `ProspectView` and its mapping. Check `src/lib/outreach/senders.ts` and `OutreachSettings.senders` for the officer name field when writing the page's `senderNameFor` in Task 3 (not in this task).
- [ ] **Step 4: Run** `npx vitest run src/lib/outreach && npx tsc --noEmit`. Expected: PASS. Fix any callers of the old `STAGE_FILTERS` keys (`not-sent`, `in-progress`, `stopped`) that tsc or grep (`grep -rn "stage=" src`) reveals.
- [ ] **Step 5: Commit** `git add src/lib/outreach/view.ts src/lib/outreach/view.test.ts src/lib/data/outreach.ts && git commit -m "Outreach: pipeline stages and Today helpers"`

### Task 2: Navigation, routes and redirects

**Files:**
- Create: `src/lib/outreach/links.ts`, `src/lib/outreach/links.test.ts`
- Create: `src/app/portal/(app)/admin/outreach/companies/page.tsx` (placeholder re-export of the current page for now), `companies/loading.tsx` (copy of `loading.tsx`)
- Modify: `src/components/layout/nav-links.ts` (outreach entries), `src/lib/admin-attention.ts` and `admin-attention.test.ts`, `src/lib/data/outreach.ts` (`OUTREACH_PORTAL_PATH` users), `src/lib/email/outreach-emails.test.ts`, `src/lib/admin-nav.test.ts` only if its fixtures break
- Modify: `outreach/discovery/page.tsx` (becomes a redirect)

**Interfaces:**
- Produces: `legacyOutreachRedirect(params: { stage?: string; prospect?: string; candidate?: string; outcome?: string }): string | null` in `links.ts`. Returns `/portal/admin/outreach/companies?...` when any of those params is present (keys forwarded as `stage` via `normalizeStage`, `prospect`, `candidate`; `outcome=ready|added|skipped` becomes `stage=found|found|skipped`), else `null`. Also `companiesHref(params?: { stage?: string; prospect?: string }): string`.
- Consumes: `normalizeStage` from Task 1.

- [ ] **Step 1: Failing tests** in `links.test.ts`: `legacyOutreachRedirect({})` is `null`; `{ prospect: "abc" }` is `/portal/admin/outreach/companies?prospect=abc`; `{ stage: "needs-you" }` keeps `needs-you`; `{ stage: "not-sent" }` becomes `stage=drafted`; `{ outcome: "skipped" }` becomes `stage=skipped`; `companiesHref({ stage: "sent" })` is `/portal/admin/outreach/companies?stage=sent`.
- [ ] **Step 2: Run** `npx vitest run src/lib/outreach/links.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `links.ts`. Update `nav-links.ts`: outreach entry keeps href `/portal/admin/outreach`, `label: "Outreach"`, `viewLabel: "Today"`; add Companies (`/portal/admin/outreach/companies`, `viewLabel: "Companies"`, icon `Building2` or the existing `Compass`, same keywords as the old Pipeline and Discovery combined plus "schedule"); remove the Schedule and Discovery nav entries (keep their keywords merged into Today and Companies so the search palette still finds them); keep Settings. All `group: "admin-outreach"`, `execOnly: true`. Replace `/portal/admin/outreach?stage=needs-you` in `admin-attention.ts` and its test with `companiesHref({ stage: "needs-you" })`. In `data/outreach.ts` and the email builders that append `?prospect=`, point links at `/portal/admin/outreach/companies?prospect=` (grep `OUTREACH_PORTAL_PATH` and `prospect=`); update `outreach-emails.test.ts` to match. `discovery/page.tsx` becomes `redirect(legacyOutreachRedirect({ outcome, candidate }) ?? companiesHref({ stage: "found" }))` using the Next redirect API per the repo's docs.
- [ ] **Step 4: Run** `npx vitest run src/lib && npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Outreach: three views, Companies route, old links redirect"` (add only the files above).

### Task 3: Today page

**Files:**
- Create: `src/app/portal/(app)/admin/outreach/today/status-bar.tsx`, `today/needs-you-card.tsx`, `today/going-out-card.tsx`, `today/funnel-card.tsx`, `today/job-details-panel.tsx`, `today/today-view.tsx` (client wrapper owning the details panel and the Add companies dialog)
- Modify: `outreach/page.tsx` (becomes Today), `outreach/schedule/page.tsx` (change "see Pipeline" link to Companies, add a "Back to Today" link)
- Delete (end of task): `outreach/health-strip.tsx` once `job-details-panel.tsx` has its job list

**Interfaces:**
- Consumes: `getOutreachOverview`, `getDiscoveryOverview` (for `counts.ready`), `buildSchedule`, `senderState`, `needsYouItems`, `todaySends`, `funnelCounts`, `legacyOutreachRedirect`, `ImportDialog`.
- Produces: page at `/portal/admin/outreach` that first calls `legacyOutreachRedirect(await searchParams)` and redirects if non-null.

- [ ] **Step 1: Read** `docs/ui-rulebook.md` fully and `health-strip.tsx`, `schedule/page.tsx`, `import-dialog.tsx`.
- [ ] **Step 2: Implement** per the spec's Today section and the mockup board "Main": `PageHeader` title "Outreach" with one lime `<Button>` "Add companies" (opens `ImportDialog`); a slim status bar card (mode chip from `senderState`, "N of cap sent today" with a `bg-foreground` meter on a `bg-muted` track, bounce rate, spam count, a chip "All daily jobs ran" (`ok`) or "N jobs need a look" (`bad`) and a "Details" button that opens `job-details-panel` as a side panel listing the five heartbeat jobs exactly as `HealthStrip` did); Needs you card (chip + company + reason + text-link action that routes to `companiesHref({ prospect: id })`; empty text "Nothing needs you."); Going out today card (time via the same Pacific formatter as `schedule/page.tsx`, company, step via `stepLabel`, officer name, chip; footer "Tomorrow: N planned" and link "See next days" to `/portal/admin/outreach/schedule`; empty text "Nothing is scheduled for today."); funnel card with six links from `funnelCounts`, Replied tile uses `bg-status-warn text-status-warn-foreground` when any need an answer. Resolve officer names from `settings` senders (look up the field names in `src/lib/outreach/senders.ts`) via `prospect.senderId`; fall back to the single sender name. Load discovery counts with a failure fallback (`catch` returns 0 for Found) so Today still renders if discovery tables are missing. Keep the existing error card on overview failure.
- [ ] **Step 2b:** wrap sections with `aria-label`s; use only token classes; no second lime button.
- [ ] **Step 3: Verify** `npx tsc --noEmit && npm run lint`. Then start the dev server (use the `run` skill or `npm run dev`), open `/portal/admin/outreach` signed in as an exec with the claude-in-chrome tools and confirm: Today shows, Add companies opens the dialog, Details opens a panel, funnel links land on Companies (still the old page at this point, that is fine), `/portal/admin/outreach?stage=needs-you` redirects. Check a phone width (resize to 390).
- [ ] **Step 4: Commit** the new and changed files by name.

### Task 4: Companies page

**Files:**
- Move: `outreach/outreach-workspace.tsx` to `outreach/companies/companies-workspace.tsx` (use `git mv`), `outreach/prospect-panel.tsx` to `outreach/companies/prospect-panel.tsx`
- Create: `companies/stage-bar.tsx`, replace placeholder `companies/page.tsx`
- Modify: `outreach/discovery/discovery-workspace.tsx` (remove its own `PageHeader`, outcome chips and Add companies button; it renders inside Companies; keep table, pagination, size chips, panel, AddEmailForm, NotDuplicate, CompanyListDialog)

**Interfaces:**
- Consumes: `STAGE_FILTERS`, `DISCOVERY_STAGES`, `isDiscoveryStage`, `normalizeStage`, `filterByStage`; `getOutreachOverview`; `getDiscoveryOverview({ filter, page, size, q, candidate })` where `filter` is `"ready"` for `found` and `"skipped"` for `skipped`.
- Produces: `StageBar({ stage, counts }: { stage: string; counts: Record<string, number> })` client component of `FilterChip`s in this order: Needs you, Found, Drafted, Scheduled, Sent, Replied, Booked, Finished, Skipped, All. It writes `stage` to the URL and clears `page` and `candidate`/`prospect`.

- [ ] **Step 1: Failing test** for any pure piece you add (e.g. `companyStageCounts(prospectCounts, discoveryCounts): Record<string, number>` in `view.ts`, found = `discoveryCounts.ready`, skipped = sum of skipped outcomes via `OUTCOME_FILTERS`): add to `view.test.ts` first and watch it fail.
- [ ] **Step 2: Implement** `companies/page.tsx` server page: `const stage = normalizeStage(sp.stage)`; always load the prospect overview; load discovery overview in parallel (filter from stage when it is a discovery stage, otherwise `"all"` with `size` 50 just for counts; if it throws, counts for found/skipped are 0 and the chips for them render disabled with no crash); render `PageHeader` (title "Companies", description "Every company, from found to booked."; actions: one lime "Add companies" button opening the prospect `ImportDialog` for pasted prospects... if the two existing dialogs differ, keep a single lime button that opens `CompanyListDialog` (discovery paste) and put the CSV `ImportDialog` behind an outline "Import a CSV" button; `Generate drafts` and `Find companies now` as `variant="outline"` buttons, disabled with the existing hints when mode is off), then `StageBar`, then either the prospect table (`CompaniesWorkspace` without its header/health strip/stage chips) or the discovery table. Remove the old "Niche" select only if unused; otherwise keep it. Keep checkbox multi-select and Rewrite selected for prospects.
- [ ] **Step 3: Verify** `npx tsc --noEmit && npm run lint && npx vitest run`. In the browser: each chip changes the list; Found and Skipped paginate (page size chips, next/prev, search) and the candidate panel opens; the prospect panel opens from a row and from `?prospect=<id>`; Add companies dialog works; no page has two lime buttons; phone width stacks.
- [ ] **Step 4: Commit** by name.

### Task 5: Settings regroup

**Files:**
- Modify: `outreach/settings/settings-form.tsx`, `outreach/settings/page.tsx`

**Interfaces:**
- Consumes: existing props `settings`, `agent`, `roster`; existing handlers (`onSave`, key handlers, sender handlers) unchanged.
- Produces: same component, all sections stacked (no `section` state), cards titled Is it on? / How fast? / Who sends? / Follow-ups / Finding companies (Advanced, containing Discovery and the Research agent). Left table of contents of anchor links (`#is-it-on`, `#how-fast`, `#who-sends`, `#follow-ups`, `#finding`), sticky at `lg`, a wrapping row on phones. Mode as three option cards (existing `MODES`), Pause as a switch-style checkbox row. When mode is `self_only` or `exec_only`, the "Is it on?" card holds an outline "Send test emails now" button calling `runSendTestNowAction` with the `SKIP_MESSAGES` toasts moved from the old workspace. The single-sender fallback sits under a native `<details>` "Advanced: single sender" inside Who sends. The form renders its own `PageHeader` (title "Outreach settings", description "Read top to bottom. Each box answers one plain question.") with the one lime "Save changes" button calling `onSave`; remove `PageHeader` from `settings/page.tsx`.

- [ ] **Step 1: Implement** by moving existing JSX blocks into the new cards without changing handlers or state. Each former `section === "x" &&` block loses its conditional.
- [ ] **Step 2: Verify** `npx tsc --noEmit && npm run lint && npx vitest run src/lib/outreach`. In the browser: change the daily cap, press Save changes, reload and confirm it persisted, then restore it; toggle each card's control and confirm every old setting is present (agent keys list, generate key, per-key audit/correct, officers add/fill-from-roster, single sender fields, discovery switch). Do not press Send test or generate/revoke real keys without asking the user; look at them only.
- [ ] **Step 3: Commit** by name.

### Task 6: Clean-up, rulebook checks and ship

**Files:**
- Delete: `outreach/health-strip.tsx` if unused; `outreach/discovery/loading.tsx` if the redirect page no longer needs it
- Modify: `docs/ui-rulebook.md` (mention the Today/Companies/Settings pattern only if section 10 or a screen list names outreach pages), `docs/outreach-setup.md` (page names)

- [ ] **Step 1:** `grep -rn "health-strip\|HealthStrip\|outreach-workspace\|stage=not-sent\|stage=in-progress" src docs` returns nothing live.
- [ ] **Step 2:** Run rulebook section 10 checks on all outreach pages (token scan, one lime button, chips with words, two-level nav, 12px floor).
- [ ] **Step 3:** `npx tsc --noEmit && npm run lint && npx vitest run && npm run build`. Expected: all pass except the 2 known `SnE Library` failures.
- [ ] **Step 4:** Browser pass at desktop and 390px width over Today, Companies (each chip), Settings, Schedule sub-page, and an old link `/portal/admin/outreach?stage=needs-you`. Report anything not visually checked instead of claiming it.
- [ ] **Step 5:** Update memory `automated_outreach.md` with the new view structure; commit and push to main.
