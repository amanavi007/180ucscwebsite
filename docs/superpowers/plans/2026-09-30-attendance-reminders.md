# Attendance Reminder Emails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** At 9pm Pacific on a meeting day, email the PM/SC leads of every project that hasn't logged attendance.

**Architecture:** A Vercel cron (two UTC schedules, guarded by an org-timezone hour check) calls a secret-protected route handler. The route loads data with the service-role client and passes it to a pure, unit-tested selector that decides who to remind; it then sends each email through the existing `sendEmail`.

**Tech Stack:** Next.js route handler, Supabase admin client, Vitest, existing `src/lib/email/send.ts`.

**Spec:** `docs/superpowers/specs/2026-09-30-attendance-reminders-design.md`

## Global Constraints

- Time zone is `ORG_TIME_ZONE` (`America/Los_Angeles`) from `src/lib/date.ts`; the reminder hour is 21.
- Crons are exactly `0 4 * * *` and `0 5 * * *` (UTC), path `/api/cron/attendance-reminders`.
- Auth is `Authorization: Bearer $CRON_SECRET`; anything else returns 401.
- Leads are `memberships.team_role` in (`pm`, `sc`); archived profiles (`archived_at` not null) are skipped.
- "Active" project means: in the quarter with `quarters.is_active = true` and `status != 'archived'`.
- Email subject is `Reminder: log attendance for <project> (<date>)`, sent via `sendEmail` (Gmail first, Resend fallback), linking to `${NEXT_PUBLIC_SITE_URL}/portal/attendance`.
- No new tables or migrations.
- `AGENTS.md` warns this Next.js version has breaking changes: before Task 3, skim the route handler docs in `node_modules/next/dist/docs/`.

## Review Focus

- `CRON_SECRET` unset: `Bearer undefined` must NOT authenticate; the route must return 401 (tested in Task 3 manual check and by code shape).
- A lead on two projects both missing attendance gets one email per project, not one merged or duplicated email (Task 1 test).
- Same person listed twice on one project (e.g. both pm and sc rows, or duplicate rows) gets one email (Task 1 test).
- A lead with no/blank email is skipped without crashing the run (Task 1 test).
- One failed send must not stop the remaining sends, and the response reports the failure count (Task 3).

## File Structure

- Create `src/lib/attendance-reminders.ts`: pure logic (`isReminderHour`, `selectReminders`). No I/O.
- Create `src/lib/attendance-reminders.test.ts`: Vitest tests for the above.
- Create `src/lib/email/attendance-reminder.ts`: `buildAttendanceReminderEmail`.
- Create `src/lib/email/attendance-reminder.test.ts`.
- Create `src/app/api/cron/attendance-reminders/route.ts`: auth, data loading, sending.
- Create `vercel.json`: the two crons.
- Modify `.env.local.example`: document `CRON_SECRET`.

---

### Task 1: Pure reminder selection and hour guard

**Files:**
- Create: `src/lib/attendance-reminders.ts`
- Test: `src/lib/attendance-reminders.test.ts`

**Interfaces:**
- Consumes: `ORG_TIME_ZONE` from `src/lib/date.ts`.
- Produces:
  - `isReminderHour(now: Date): boolean` true when the hour in `ORG_TIME_ZONE` is 21.
  - `interface ReminderLead { projectId: string; email: string | null; archivedAt: string | null }`
  - `interface ReminderProject { id: string; name: string }`
  - `interface Reminder { projectId: string; projectName: string; date: string; to: string }`
  - `selectReminders(input: { today: string; meetingDates: string[]; projects: ReminderProject[]; loggedProjectIds: string[]; leads: ReminderLead[] }): Reminder[]`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/attendance-reminders.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isReminderHour, selectReminders, type ReminderLead } from "./attendance-reminders";

describe("isReminderHour", () => {
  it("is true at 21:30 Pacific in summer (PDT, 04:30 UTC next day)", () => {
    expect(isReminderHour(new Date("2026-09-30T04:30:00Z"))).toBe(true);
  });
  it("is false at 22:30 Pacific in summer (05:30 UTC)", () => {
    expect(isReminderHour(new Date("2026-09-30T05:30:00Z"))).toBe(false);
  });
  it("is true at 21:30 Pacific in winter (PST, 05:30 UTC next day)", () => {
    expect(isReminderHour(new Date("2026-12-02T05:30:00Z"))).toBe(true);
  });
  it("is false at 20:30 Pacific in winter (04:30 UTC)", () => {
    expect(isReminderHour(new Date("2026-12-02T04:30:00Z"))).toBe(false);
  });
});

const today = "2026-09-29";
const projects = [
  { id: "p1", name: "Acme" },
  { id: "p2", name: "Globex" },
];
const lead = (projectId: string, email: string | null, archivedAt: string | null = null): ReminderLead => ({
  projectId,
  email,
  archivedAt,
});
const base = {
  today,
  meetingDates: [today],
  projects,
  loggedProjectIds: [] as string[],
  leads: [lead("p1", "a@x.com"), lead("p2", "b@x.com")],
};

describe("selectReminders", () => {
  it("reminds every lead of projects with no attendance", () => {
    expect(selectReminders(base)).toEqual([
      { projectId: "p1", projectName: "Acme", date: today, to: "a@x.com" },
      { projectId: "p2", projectName: "Globex", date: today, to: "b@x.com" },
    ]);
  });

  it("returns nothing when today is not a meeting day", () => {
    expect(selectReminders({ ...base, meetingDates: ["2026-09-30"] })).toEqual([]);
  });

  it("skips projects whose attendance is already logged", () => {
    const result = selectReminders({ ...base, loggedProjectIds: ["p1"] });
    expect(result.map((r) => r.projectId)).toEqual(["p2"]);
  });

  it("skips projects with no leads", () => {
    const result = selectReminders({ ...base, leads: [lead("p2", "b@x.com")] });
    expect(result.map((r) => r.projectId)).toEqual(["p2"]);
  });

  it("skips archived leads", () => {
    const result = selectReminders({
      ...base,
      leads: [lead("p1", "a@x.com", "2026-09-01T00:00:00Z"), lead("p1", "c@x.com")],
    });
    expect(result.map((r) => r.to)).toEqual(["c@x.com"]);
  });

  it("emails each lead of a project once, even with duplicate or differently-cased rows", () => {
    const result = selectReminders({
      ...base,
      leads: [lead("p1", "a@x.com"), lead("p1", "A@x.com"), lead("p1", "d@x.com")],
    });
    expect(result.map((r) => r.to)).toEqual(["a@x.com", "d@x.com"]);
  });

  it("sends a lead on two projects one email per project", () => {
    const result = selectReminders({ ...base, leads: [lead("p1", "a@x.com"), lead("p2", "a@x.com")] });
    expect(result.map((r) => [r.projectId, r.to])).toEqual([
      ["p1", "a@x.com"],
      ["p2", "a@x.com"],
    ]);
  });

  it("skips leads with a missing or blank email", () => {
    const result = selectReminders({
      ...base,
      leads: [lead("p1", null), lead("p1", "  "), lead("p1", "a@x.com")],
    });
    expect(result.map((r) => r.to)).toEqual(["a@x.com"]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/attendance-reminders.test.ts`
Expected: FAIL, cannot resolve `./attendance-reminders`.

- [ ] **Step 3: Implement**

Create `src/lib/attendance-reminders.ts`:

```ts
import { ORG_TIME_ZONE } from "./date";

const REMINDER_HOUR = 21;

/** True when `now` falls in the 9pm hour in the org's time zone (DST-aware). */
export function isReminderHour(now: Date): boolean {
  const hour = new Intl.DateTimeFormat("en-US", {
    timeZone: ORG_TIME_ZONE,
    hourCycle: "h23",
    hour: "2-digit",
  }).format(now);
  return Number(hour) === REMINDER_HOUR;
}

export interface ReminderLead {
  projectId: string;
  email: string | null;
  archivedAt: string | null;
}

export interface ReminderProject {
  id: string;
  name: string;
}

export interface Reminder {
  projectId: string;
  projectName: string;
  date: string;
  to: string;
}

/**
 * Who to email: every non-archived lead (once) of each project that has no
 * attendance logged for `today`, but only if `today` is a meeting day.
 */
export function selectReminders(input: {
  today: string;
  meetingDates: string[];
  projects: ReminderProject[];
  loggedProjectIds: string[];
  leads: ReminderLead[];
}): Reminder[] {
  if (!input.meetingDates.includes(input.today)) return [];

  const logged = new Set(input.loggedProjectIds);
  const reminders: Reminder[] = [];

  for (const project of input.projects) {
    if (logged.has(project.id)) continue;

    const seen = new Set<string>();
    for (const lead of input.leads) {
      if (lead.projectId !== project.id || lead.archivedAt) continue;
      const email = lead.email?.trim();
      if (!email || seen.has(email.toLowerCase())) continue;
      seen.add(email.toLowerCase());
      reminders.push({ projectId: project.id, projectName: project.name, date: input.today, to: email });
    }
  }

  return reminders;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/attendance-reminders.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/attendance-reminders.ts src/lib/attendance-reminders.test.ts
git commit -m "Attendance reminders: selection logic and 9pm hour guard"
```

---

### Task 2: Reminder email content

**Files:**
- Create: `src/lib/email/attendance-reminder.ts`
- Test: `src/lib/email/attendance-reminder.test.ts`

**Interfaces:**
- Consumes: `formatDateLong` from `src/lib/date.ts`; `EmailContent` type from `src/lib/email/coffee-chat-confirmation.ts` (`{ subject; html; text }`).
- Produces: `buildAttendanceReminderEmail(input: { projectName: string; date: string; siteUrl: string }): EmailContent`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/email/attendance-reminder.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildAttendanceReminderEmail } from "./attendance-reminder";

const input = { projectName: "Acme", date: "2026-09-29", siteUrl: "https://example.org" };

describe("buildAttendanceReminderEmail", () => {
  it("puts the project and date in the subject", () => {
    expect(buildAttendanceReminderEmail(input).subject).toBe(
      "Reminder: log attendance for Acme (2026-09-29)",
    );
  });

  it("links to the attendance page in both html and text", () => {
    const { html, text } = buildAttendanceReminderEmail(input);
    expect(html).toContain('href="https://example.org/portal/attendance"');
    expect(text).toContain("https://example.org/portal/attendance");
  });

  it("escapes the project name in html", () => {
    const { html } = buildAttendanceReminderEmail({ ...input, projectName: "<b>Acme & Co</b>" });
    expect(html).toContain("&lt;b&gt;Acme &amp; Co&lt;/b&gt;");
    expect(html).not.toContain("<b>Acme");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/email/attendance-reminder.test.ts`
Expected: FAIL, cannot resolve `./attendance-reminder`.

- [ ] **Step 3: Implement**

Create `src/lib/email/attendance-reminder.ts`:

```ts
import { formatDateLong } from "../date";
import type { EmailContent } from "./coffee-chat-confirmation";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildAttendanceReminderEmail(input: {
  projectName: string;
  date: string;
  siteUrl: string;
}): EmailContent {
  const attendanceUrl = `${input.siteUrl}/portal/attendance`;
  const dateLabel = formatDateLong(input.date);
  const subject = `Reminder: log attendance for ${input.projectName} (${input.date})`;

  // Project name is free text, so escape anything interpolated into HTML.
  const html = `
    <p>Hi,</p>
    <p>${escapeHtml(input.projectName)} met on <strong>${escapeHtml(dateLabel)}</strong>, but attendance hasn't been logged yet.</p>
    <p><a href="${escapeHtml(attendanceUrl)}">Log attendance in the portal</a></p>
    <p>Thanks!<br />180DC UCSC</p>
  `.trim();

  const text = [
    "Hi,",
    `${input.projectName} met on ${dateLabel}, but attendance hasn't been logged yet.`,
    `Log attendance in the portal: ${attendanceUrl}`,
    "Thanks!",
    "180DC UCSC",
  ].join("\n\n");

  return { subject, html, text };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/email/attendance-reminder.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/email/attendance-reminder.ts src/lib/email/attendance-reminder.test.ts
git commit -m "Attendance reminders: email content"
```

---

### Task 3: Cron route, Vercel schedule, env docs

**Files:**
- Create: `src/app/api/cron/attendance-reminders/route.ts`
- Create: `vercel.json`
- Modify: `.env.local.example` (append)

**Interfaces:**
- Consumes: `isReminderHour`, `selectReminders`, `ReminderLead` from Task 1; `buildAttendanceReminderEmail` from Task 2; `createAdminClient` from `@/lib/supabase/admin`; `sendEmail` from `@/lib/email/send`; `formatOrgDate` from `@/lib/date`.
- Produces: `GET /api/cron/attendance-reminders` returning JSON `{ sent: number, failed: number }` or `{ skipped: string }`.

- [ ] **Step 1: Skim Next.js docs**

Run: `ls node_modules/next/dist/docs/` and read the route handler page (search for "route handlers" / `route.ts`). Confirm `export async function GET(request: Request)` and the `dynamic` behavior for a GET handler that reads headers. If the conventions differ from the code below, follow the docs.

- [ ] **Step 2: Write the route**

Create `src/app/api/cron/attendance-reminders/route.ts`:

```ts
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send";
import { buildAttendanceReminderEmail } from "@/lib/email/attendance-reminder";
import { isReminderHour, selectReminders, type ReminderLead } from "@/lib/attendance-reminders";
import { formatOrgDate } from "@/lib/date";

// Always run fresh; this reads the clock and the database.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // An unset secret must never authenticate ("Bearer undefined").
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const now = new Date();
  // Vercel cron is UTC-only, so two schedules fire; only the one landing in 9pm Pacific does work.
  if (!isReminderHour(now)) return Response.json({ skipped: "not 9pm Pacific" });

  const supabase = createAdminClient();
  const today = formatOrgDate(now);

  const { data: quarter, error: quarterError } = await supabase
    .from("quarters")
    .select("id")
    .eq("is_active", true)
    .maybeSingle();
  if (quarterError) return Response.json({ error: quarterError.message }, { status: 500 });
  if (!quarter) return Response.json({ skipped: "no active quarter" });

  const { data: meetingRows, error: meetingError } = await supabase
    .from("meeting_dates")
    .select("date")
    .eq("quarter_id", quarter.id)
    .eq("date", today);
  if (meetingError) return Response.json({ error: meetingError.message }, { status: 500 });
  if (!meetingRows.length) return Response.json({ skipped: "not a meeting day" });

  const { data: projectRows, error: projectError } = await supabase
    .from("projects")
    .select("id, client_name")
    .eq("quarter_id", quarter.id)
    .neq("status", "archived");
  if (projectError) return Response.json({ error: projectError.message }, { status: 500 });
  const projectIds = projectRows.map((p) => p.id);
  if (!projectIds.length) return Response.json({ sent: 0, failed: 0 });

  const { data: sessionRows, error: sessionError } = await supabase
    .from("attendance_sessions")
    .select("project_id")
    .eq("date", today)
    .in("project_id", projectIds);
  if (sessionError) return Response.json({ error: sessionError.message }, { status: 500 });

  const { data: leadRows, error: leadError } = await supabase
    .from("memberships")
    .select("project_id, profiles(email, archived_at)")
    .in("team_role", ["pm", "sc"])
    .in("project_id", projectIds);
  if (leadError) return Response.json({ error: leadError.message }, { status: 500 });

  const leads: ReminderLead[] = leadRows.map((row) => {
    // The embedded relation is a single profile row (user_id is a many-to-one FK).
    const profile = row.profiles as unknown as { email: string; archived_at: string | null } | null;
    return { projectId: row.project_id, email: profile?.email ?? null, archivedAt: profile?.archived_at ?? null };
  });

  const reminders = selectReminders({
    today,
    meetingDates: [today],
    projects: projectRows.map((p) => ({ id: p.id, name: p.client_name })),
    loggedProjectIds: sessionRows.map((s) => s.project_id),
    leads,
  });

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL!;
  let sent = 0;
  let failed = 0;
  for (const reminder of reminders) {
    const email = buildAttendanceReminderEmail({
      projectName: reminder.projectName,
      date: reminder.date,
      siteUrl,
    });
    try {
      await sendEmail({ to: reminder.to, ...email });
      sent++;
    } catch (err) {
      failed++;
      console.error(`attendance reminder to ${reminder.to} for ${reminder.projectName} failed:`, err);
    }
  }

  return Response.json({ sent, failed });
}
```

- [ ] **Step 3: Add the Vercel cron config**

Create `vercel.json`:

```json
{
  "crons": [
    { "path": "/api/cron/attendance-reminders", "schedule": "0 4 * * *" },
    { "path": "/api/cron/attendance-reminders", "schedule": "0 5 * * *" }
  ]
}
```

- [ ] **Step 4: Document the env var**

Append to `.env.local.example`:

```
# Vercel Cron -- protects /api/cron/* routes (attendance reminder emails).
# Any long random string (e.g. `openssl rand -hex 32`); also set it in the
# Vercel project's environment variables. Vercel sends it as a Bearer token.
CRON_SECRET=
```

- [ ] **Step 5: Typecheck, lint, full tests**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: no type errors (if the `memberships` embed `profiles` select errors on types, adjust the cast, not the query), no new lint errors, all tests PASS.

- [ ] **Step 6: Manual auth and guard check**

Run the dev server (`npm run dev`, with `CRON_SECRET=test` in `.env.local`), then:

- `curl -i localhost:3000/api/cron/attendance-reminders` -> `401`.
- `curl -i -H "Authorization: Bearer wrong" localhost:3000/api/cron/attendance-reminders` -> `401`.
- `curl -i -H "Authorization: Bearer test" localhost:3000/api/cron/attendance-reminders` -> `200` with `{"skipped":"not 9pm Pacific"}` outside 9pm Pacific.
- Remove `CRON_SECRET` and restart: `curl -i -H "Authorization: Bearer undefined" ...` -> `401`.

Do not send real emails from a dev machine. To exercise the full path, temporarily point at a test project, or confirm via the unit tests.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/cron/attendance-reminders/route.ts vercel.json .env.local.example
git commit -m "Attendance reminders: cron route and Vercel schedule"
```
