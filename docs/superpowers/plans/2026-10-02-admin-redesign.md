# Admin Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the stacked admin tab rows with an Admin home hub plus a breadcrumb/sibling-tab nav, declutter the Members page, and unify the quarter picker.

**Architecture:** `/portal/admin` becomes a server-rendered hub (needs-attention list, quick actions, area cards). Members moves to `/portal/admin/members`. A client `AdminBreadcrumb` (driven by pure helpers in `src/lib/admin-nav.ts`) replaces `AdminNav` and hosts the single quarter picker. The attention list is computed by pure functions (`src/lib/admin-attention.ts`, unit tested) fed by an isolated-failure server aggregator.

**Tech Stack:** Next.js 16 (App Router, server components, `searchParams` is a Promise), React 19, Tailwind, shadcn-style components on `@base-ui/react` (use `render={...}`, not `asChild`), Supabase, Vitest (`npm test`).

**Spec:** `docs/superpowers/specs/2026-10-02-admin-redesign-design.md`

## Global Constraints

- `AGENTS.md`: this is NOT the Next.js you know. Before writing code that touches routing, `searchParams`, `Link`, or `useSearchParams`, skim the relevant guide in `node_modules/next/dist/docs/01-app/` and copy patterns already used in this repo.
- Exec-only area: the gate stays in `admin/layout.tsx` (`isExec(profile.role)` else `redirect("/portal")`).
- No schema or data-model changes. No new dependencies.
- Pure logic in `src/lib/*.ts` that has tests must use **relative** imports only (Vitest has no `@/` alias configured). App/components code uses `@/`.
- Commit messages: plain, no `Co-Authored-By` or Claude attribution (project memory: never add Claude signatures to commits or PRs).
- Work happens on branch `worktree-admin-redesign-spec` in the existing worktree `/Users/amanavi/180ucscwebsite/.claude/worktrees/admin-redesign-spec`. Never push to main.
- Admin base path is `/portal/admin`. Never write `/admin/...` links (the existing `QuarterSelect basePath="/admin/..."` usages are bugs this plan removes).
- Nothing out of scope changes: Team Builder, Team Page, Coffee Chats, Quarters, Rooms, Meeting Days, Stats, Settings and Activity internals stay as they are apart from the nav chrome and picker removal described in tasks.

## Review Focus

1. **No quarters exist yet** (fresh org): hub must still render; attention items that need a quarter are omitted; links carry no `?quarter=`; breadcrumb hides the picker. Pinned in Tasks 1, 2 and 4.
2. **Consultant with `attendanceRate: null`** (no meetings held yet): must not count as "below threshold"; a rate exactly equal to the threshold is not below it. Pinned in Task 2.
3. **Coffee-chat slot date edges**: slots today and today+6 count, today+7 and yesterday do not; month rollover works; unpublished or booked slots never count. Pinned in Task 2.
4. **Garbage `?quarter=` value** (stale bookmark, deleted quarter): breadcrumb and hub fall back to the active quarter instead of crashing or showing an empty picker. Pinned in Task 1.
5. **Unknown `?action=` value** on Members: ignored, page renders normally. Pinned in Task 1.
6. **One attention source throws** (e.g. coffee-chat query fails): the other items still render. Pinned in Task 2 (null inputs) and implemented in Task 3.

---

## File Map

Create:
- `src/lib/admin-nav.ts`, `src/lib/admin-nav.test.ts`: pure nav helpers
- `src/lib/admin-attention.ts`, `src/lib/admin-attention.test.ts`: pure attention logic
- `src/lib/data/admin-attention.ts`: server aggregator
- `src/app/portal/(app)/admin/admin-breadcrumb.tsx`: breadcrumb + sibling tabs + quarter picker
- `src/app/portal/(app)/admin/hub/{hub-header,attention-list,quick-actions,area-cards,hub-search-button}.tsx`
- `src/app/portal/(app)/admin/members/{member-types.ts,masked-secret.tsx,bulk-add-dialog.tsx,member-row.tsx,archived-members.tsx}`

Modify:
- `src/components/layout/nav-links.ts`: `quarterScoped` flag, Members href
- `src/components/layout/app-shell.tsx`: listen for an `open-command-palette` event
- `src/components/list-search.tsx`: optional `autoFocus`
- `src/app/portal/(app)/admin/layout.tsx`, `page.tsx` (becomes hub), `stats/page.tsx`, `team-builder/page.tsx`, `meeting-days/page.tsx`, `rooms/page.tsx`, `coffee-chats/page.tsx`

Move: `admin/page.tsx` → `admin/members/page.tsx`; `admin/members-panel.tsx` → `admin/members/members-panel.tsx`

Delete: `admin/admin-nav.tsx`

(`A` below means `src/app/portal/(app)/admin`.)

---

### Task 1: Pure nav helpers

**Files:**
- Create: `src/lib/admin-nav.ts`
- Test: `src/lib/admin-nav.test.ts`

**Interfaces:**
- Produces:
  - `interface AdminNavItem { href: string; label: string; group?: string; quarterScoped?: boolean }`
  - `ADMIN_AREA_LABELS: Record<string, string>`, `ADMIN_HUB_HREF = "/portal/admin"`
  - `getAdminLocation<T extends AdminNavItem>(pathname: string, links: T[]): { areaKey: string; areaLabel: string; page: T; siblings: T[] } | null`
  - `withQuarterParam(href: string, quarterId: string | null | undefined): string`
  - `resolveQuarterId(param: string | null | undefined, quarters: { id: string }[], fallbackId: string | null): string | null`
  - `type MembersAction = "bulk-add" | "find"`; `parseMembersAction(value: string | string[] | null | undefined): MembersAction | null`

- [ ] **Step 1: Write the failing test**

Create `src/lib/admin-nav.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  ADMIN_AREA_LABELS,
  getAdminLocation,
  parseMembersAction,
  resolveQuarterId,
  withQuarterParam,
  type AdminNavItem,
} from "./admin-nav";

const LINKS: AdminNavItem[] = [
  { href: "/portal/admin/members", label: "Members", group: "admin-people" },
  { href: "/portal/admin/team-builder", label: "Team Builder", group: "admin-people", quarterScoped: true },
  { href: "/portal/admin/quarters", label: "Quarters", group: "admin-quarter-setup" },
  { href: "/portal/admin/coffee-chats", label: "Coffee Chats", group: "admin-recruitment" },
];

describe("getAdminLocation", () => {
  it("returns the page, its area label and sibling pages", () => {
    const loc = getAdminLocation("/portal/admin/team-builder", LINKS);
    expect(loc?.page.label).toBe("Team Builder");
    expect(loc?.areaKey).toBe("admin-people");
    expect(loc?.areaLabel).toBe(ADMIN_AREA_LABELS["admin-people"]);
    expect(loc?.siblings.map((l) => l.label)).toEqual(["Members", "Team Builder"]);
  });

  it("matches nested paths under a page", () => {
    expect(getAdminLocation("/portal/admin/members/anything", LINKS)?.page.label).toBe("Members");
  });

  it("returns a single-page area with itself as the only sibling", () => {
    expect(getAdminLocation("/portal/admin/coffee-chats", LINKS)?.siblings).toHaveLength(1);
  });

  it("returns null for the hub and for unknown paths", () => {
    expect(getAdminLocation("/portal/admin", LINKS)).toBeNull();
    expect(getAdminLocation("/portal/admin/nope", LINKS)).toBeNull();
  });

  it("does not match a path that merely shares a prefix", () => {
    expect(getAdminLocation("/portal/admin/members-archive", LINKS)).toBeNull();
  });
});

describe("withQuarterParam", () => {
  it("appends ?quarter= when an id is given", () => {
    expect(withQuarterParam("/portal/admin/stats", "q1")).toBe("/portal/admin/stats?quarter=q1");
  });
  it("uses & when the href already has a query", () => {
    expect(withQuarterParam("/portal/admin/coffee-chats?tab=schedule", "q1")).toBe(
      "/portal/admin/coffee-chats?tab=schedule&quarter=q1",
    );
  });
  it("returns the href untouched with no quarter", () => {
    expect(withQuarterParam("/portal/admin/stats", null)).toBe("/portal/admin/stats");
    expect(withQuarterParam("/portal/admin/stats", undefined)).toBe("/portal/admin/stats");
  });
});

describe("resolveQuarterId", () => {
  const quarters = [{ id: "a" }, { id: "b" }];
  it("keeps a valid param", () => expect(resolveQuarterId("b", quarters, "a")).toBe("b"));
  it("falls back for a garbage or deleted quarter id", () => {
    expect(resolveQuarterId("zzz", quarters, "a")).toBe("a");
  });
  it("falls back when there is no param", () => expect(resolveQuarterId(null, quarters, "a")).toBe("a"));
  it("returns null when there are no quarters at all", () => {
    expect(resolveQuarterId("a", [], null)).toBeNull();
  });
});

describe("parseMembersAction", () => {
  it("accepts the two known actions", () => {
    expect(parseMembersAction("bulk-add")).toBe("bulk-add");
    expect(parseMembersAction("find")).toBe("find");
  });
  it("ignores unknown, array and missing values", () => {
    expect(parseMembersAction("delete-everyone")).toBeNull();
    expect(parseMembersAction(["bulk-add"])).toBeNull();
    expect(parseMembersAction(undefined)).toBeNull();
    expect(parseMembersAction(null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/admin-nav.test.ts`
Expected: FAIL (cannot resolve `./admin-nav`).

- [ ] **Step 3: Write the implementation**

Create `src/lib/admin-nav.ts`:

```ts
export interface AdminNavItem {
  href: string;
  label: string;
  group?: string;
  quarterScoped?: boolean;
}

export const ADMIN_HUB_HREF = "/portal/admin";

/** Display order matters: the hub's area cards render in this order. */
export const ADMIN_AREA_LABELS: Record<string, string> = {
  "admin-people": "People",
  "admin-quarter-setup": "Quarter setup",
  "admin-recruitment": "Recruitment",
  "admin-system": "System",
};

export interface AdminLocation<T extends AdminNavItem> {
  areaKey: string;
  areaLabel: string;
  page: T;
  siblings: T[];
}

export function getAdminLocation<T extends AdminNavItem>(pathname: string, links: T[]): AdminLocation<T> | null {
  const page = links.find((l) => pathname === l.href || pathname.startsWith(`${l.href}/`));
  if (!page || !page.group) return null;
  return {
    areaKey: page.group,
    areaLabel: ADMIN_AREA_LABELS[page.group] ?? page.group,
    page,
    siblings: links.filter((l) => l.group === page.group),
  };
}

export function withQuarterParam(href: string, quarterId: string | null | undefined): string {
  if (!quarterId) return href;
  return `${href}${href.includes("?") ? "&" : "?"}quarter=${encodeURIComponent(quarterId)}`;
}

export function resolveQuarterId(
  param: string | null | undefined,
  quarters: { id: string }[],
  fallbackId: string | null,
): string | null {
  if (param && quarters.some((q) => q.id === param)) return param;
  return fallbackId;
}

export type MembersAction = "bulk-add" | "find";

export function parseMembersAction(value: string | string[] | null | undefined): MembersAction | null {
  return value === "bulk-add" || value === "find" ? value : null;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/lib/admin-nav.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/admin-nav.ts src/lib/admin-nav.test.ts
git commit -m "Admin nav: pure helpers for breadcrumb location, quarter param and members action"
```

---

### Task 2: Pure attention logic

**Files:**
- Create: `src/lib/admin-attention.ts`
- Test: `src/lib/admin-attention.test.ts`

**Interfaces:**
- Consumes: `withQuarterParam` from `./admin-nav`; `parseLocalDate`, `toDateString` from `./date`
- Produces:
  - `type AttentionKind = "attendance" | "draft" | "coffee-chats" | "team-page"`
  - `interface AttentionItem { kind: AttentionKind; label: string; actionLabel: string; href: string }`
  - `countBelowThreshold(rows: { attendanceRate: number | null }[], threshold: number): number`
  - `hasUnfinalizedDraft(plans: { isFinalized: boolean }[]): boolean`
  - `countUnbookedSlotsThisWeek(slots: { date: string; published: boolean; bookingStatus: "open" | "booked" }[], today: string): number`
  - `interface AttentionCounts { quarterId: string | null; lowAttendance: number | null; draftUnfinalized: boolean | null; unbookedSlots: number | null; pendingTeamSubmissions: number | null }` (`null` means "source unavailable: omit")
  - `buildAttentionItems(counts: AttentionCounts): AttentionItem[]` (order: attendance, draft, coffee-chats, team-page)

- [ ] **Step 1: Write the failing test**

Create `src/lib/admin-attention.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  buildAttentionItems,
  countBelowThreshold,
  countUnbookedSlotsThisWeek,
  hasUnfinalizedDraft,
  type AttentionCounts,
} from "./admin-attention";

const CLEAR: AttentionCounts = {
  quarterId: "q1",
  lowAttendance: 0,
  draftUnfinalized: false,
  unbookedSlots: 0,
  pendingTeamSubmissions: 0,
};

describe("countBelowThreshold", () => {
  it("counts only rates strictly below the threshold", () => {
    const rows = [{ attendanceRate: 0.5 }, { attendanceRate: 0.8 }, { attendanceRate: 0.95 }];
    expect(countBelowThreshold(rows, 0.8)).toBe(1);
  });
  it("ignores members with no rate yet (null)", () => {
    expect(countBelowThreshold([{ attendanceRate: null }, { attendanceRate: 0.1 }], 0.8)).toBe(1);
  });
  it("returns 0 for an empty list", () => expect(countBelowThreshold([], 0.8)).toBe(0));
});

describe("hasUnfinalizedDraft", () => {
  it("is false with no drafts", () => expect(hasUnfinalizedDraft([])).toBe(false));
  it("is true when drafts exist and none is finalized", () => {
    expect(hasUnfinalizedDraft([{ isFinalized: false }, { isFinalized: false }])).toBe(true);
  });
  it("is false once any draft is finalized", () => {
    expect(hasUnfinalizedDraft([{ isFinalized: false }, { isFinalized: true }])).toBe(false);
  });
});

describe("countUnbookedSlotsThisWeek", () => {
  const slot = (date: string, over: Partial<{ published: boolean; bookingStatus: "open" | "booked" }> = {}) => ({
    date,
    published: true,
    bookingStatus: "open" as const,
    ...over,
  });

  it("counts open published slots from today through today+6", () => {
    const slots = [slot("2026-10-02"), slot("2026-10-08"), slot("2026-10-09"), slot("2026-10-01")];
    expect(countUnbookedSlotsThisWeek(slots, "2026-10-02")).toBe(2);
  });
  it("rolls over a month boundary", () => {
    const slots = [slot("2026-11-03"), slot("2026-11-04")];
    expect(countUnbookedSlotsThisWeek(slots, "2026-10-28")).toBe(1);
  });
  it("skips unpublished and booked slots", () => {
    const slots = [slot("2026-10-03", { published: false }), slot("2026-10-03", { bookingStatus: "booked" })];
    expect(countUnbookedSlotsThisWeek(slots, "2026-10-02")).toBe(0);
  });
});

describe("buildAttentionItems", () => {
  it("returns nothing when everything is clear", () => {
    expect(buildAttentionItems(CLEAR)).toEqual([]);
  });

  it("builds each item with a deep link, in a stable order", () => {
    const items = buildAttentionItems({
      quarterId: "q1",
      lowAttendance: 7,
      draftUnfinalized: true,
      unbookedSlots: 3,
      pendingTeamSubmissions: 2,
    });
    expect(items.map((i) => i.kind)).toEqual(["attendance", "draft", "coffee-chats", "team-page"]);
    expect(items[0]).toMatchObject({
      label: "7 consultants are below the attendance threshold",
      href: "/portal/admin/stats?quarter=q1",
    });
    expect(items[1].href).toBe("/portal/admin/team-builder?quarter=q1");
    expect(items[2].href).toBe("/portal/admin/coffee-chats?tab=schedule");
    expect(items[3].href).toBe("/portal/admin/team-page");
  });

  it("uses singular wording for a count of one", () => {
    const items = buildAttentionItems({ ...CLEAR, lowAttendance: 1, unbookedSlots: 1, pendingTeamSubmissions: 1 });
    expect(items.map((i) => i.label)).toEqual([
      "1 consultant is below the attendance threshold",
      "1 open coffee-chat slot has no booking in the next 7 days",
      "1 team-page submission is waiting for review",
    ]);
  });

  it("omits sources that are unavailable (null) but keeps the rest", () => {
    const items = buildAttentionItems({
      quarterId: "q1",
      lowAttendance: null,
      draftUnfinalized: null,
      unbookedSlots: null,
      pendingTeamSubmissions: 4,
    });
    expect(items.map((i) => i.kind)).toEqual(["team-page"]);
  });

  it("emits no ?quarter= when there is no quarter", () => {
    const items = buildAttentionItems({ ...CLEAR, quarterId: null, lowAttendance: 2, draftUnfinalized: true });
    expect(items[0].href).toBe("/portal/admin/stats");
    expect(items[1].href).toBe("/portal/admin/team-builder");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/admin-attention.test.ts`
Expected: FAIL (cannot resolve `./admin-attention`).

- [ ] **Step 3: Write the implementation**

Create `src/lib/admin-attention.ts`:

```ts
import { addDays } from "date-fns";
import { withQuarterParam } from "./admin-nav";
import { parseLocalDate, toDateString } from "./date";

export type AttentionKind = "attendance" | "draft" | "coffee-chats" | "team-page";

export interface AttentionItem {
  kind: AttentionKind;
  label: string;
  actionLabel: string;
  href: string;
}

/** `null` on any field means that data source was unavailable, so its item is omitted. */
export interface AttentionCounts {
  quarterId: string | null;
  lowAttendance: number | null;
  draftUnfinalized: boolean | null;
  unbookedSlots: number | null;
  pendingTeamSubmissions: number | null;
}

export function countBelowThreshold(rows: { attendanceRate: number | null }[], threshold: number): number {
  return rows.filter((r) => r.attendanceRate !== null && r.attendanceRate < threshold).length;
}

export function hasUnfinalizedDraft(plans: { isFinalized: boolean }[]): boolean {
  return plans.length > 0 && !plans.some((p) => p.isFinalized);
}

export function countUnbookedSlotsThisWeek(
  slots: { date: string; published: boolean; bookingStatus: "open" | "booked" }[],
  today: string,
): number {
  const lastDay = toDateString(addDays(parseLocalDate(today), 6));
  return slots.filter(
    (s) => s.published && s.bookingStatus === "open" && s.date >= today && s.date <= lastDay,
  ).length;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function buildAttentionItems(counts: AttentionCounts): AttentionItem[] {
  const items: AttentionItem[] = [];

  if (counts.lowAttendance && counts.lowAttendance > 0) {
    items.push({
      kind: "attendance",
      label: `${plural(counts.lowAttendance, "consultant is", "consultants are")} below the attendance threshold`,
      actionLabel: "See who",
      href: withQuarterParam("/portal/admin/stats", counts.quarterId),
    });
  }
  if (counts.draftUnfinalized) {
    items.push({
      kind: "draft",
      label: "A team draft hasn't been finalized",
      actionLabel: "Review draft",
      href: withQuarterParam("/portal/admin/team-builder", counts.quarterId),
    });
  }
  if (counts.unbookedSlots && counts.unbookedSlots > 0) {
    items.push({
      kind: "coffee-chats",
      label: `${plural(counts.unbookedSlots, "open coffee-chat slot has", "open coffee-chat slots have")} no booking in the next 7 days`,
      actionLabel: "View slots",
      href: "/portal/admin/coffee-chats?tab=schedule",
    });
  }
  if (counts.pendingTeamSubmissions && counts.pendingTeamSubmissions > 0) {
    items.push({
      kind: "team-page",
      label: `${plural(counts.pendingTeamSubmissions, "team-page submission is", "team-page submissions are")} waiting for review`,
      actionLabel: "Review",
      href: "/portal/admin/team-page",
    });
  }

  return items;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/lib/admin-attention.test.ts`
Expected: PASS. If `toDateString` has a different output format, read `src/lib/date.ts:25` and adjust only the implementation to produce `YYYY-MM-DD`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/admin-attention.ts src/lib/admin-attention.test.ts
git commit -m "Admin hub: pure needs-attention logic with tests"
```

---

### Task 3: Attention aggregator (server)

**Files:**
- Create: `src/lib/data/admin-attention.ts`

**Interfaces:**
- Consumes: Task 2 functions; `getConsultantStatsRollup(quarterId)`, `getAttendanceAlertThreshold(true)`, `getPlansForQuarter(quarterId)` (returns `PlanSummary[]` with `isFinalized`), `getAllSlots()` (returns `SlotRow[]` with `date`, `published`, `bookingStatus`), `getPendingTeamSubmissionCount()`, `getOrgTodayDateString()`
- Produces: `getAdminAttentionItems(quarterId: string | null): Promise<AttentionItem[]>`

- [ ] **Step 1: Write the implementation**

Create `src/lib/data/admin-attention.ts`:

```ts
import "server-only";
import { getConsultantStatsRollup } from "@/lib/data/consultant-stats";
import { getAttendanceAlertThreshold } from "@/lib/data/org-settings";
import { getPlansForQuarter } from "@/lib/data/team-builder";
import { getAllSlots } from "@/lib/data/coffee-chat";
import { getPendingTeamSubmissionCount } from "@/lib/data/team-page";
import { getOrgTodayDateString } from "@/lib/date";
import {
  buildAttentionItems,
  countBelowThreshold,
  countUnbookedSlotsThisWeek,
  hasUnfinalizedDraft,
  type AttentionItem,
} from "@/lib/admin-attention";

function valueOrNull<T>(result: PromiseSettledResult<T>): T | null {
  if (result.status === "fulfilled") return result.value;
  console.error("Admin attention source failed:", result.reason);
  return null;
}

/**
 * Each source is fetched independently: if one fails it is dropped (and logged)
 * instead of breaking the hub.
 */
export async function getAdminAttentionItems(quarterId: string | null): Promise<AttentionItem[]> {
  const today = getOrgTodayDateString();

  const [stats, plans, slots, pending] = await Promise.allSettled([
    quarterId
      ? Promise.all([getConsultantStatsRollup(quarterId), getAttendanceAlertThreshold(true)])
      : Promise.resolve(null),
    quarterId ? getPlansForQuarter(quarterId) : Promise.resolve(null),
    getAllSlots(),
    getPendingTeamSubmissionCount(),
  ]);

  const statsValue = valueOrNull(stats);
  const plansValue = valueOrNull(plans);
  const slotsValue = valueOrNull(slots);

  return buildAttentionItems({
    quarterId,
    lowAttendance: statsValue ? countBelowThreshold(statsValue[0], statsValue[1]) : null,
    draftUnfinalized: plansValue ? hasUnfinalizedDraft(plansValue) : null,
    unbookedSlots: slotsValue ? countUnbookedSlotsThisWeek(slotsValue, today) : null,
    pendingTeamSubmissions: valueOrNull(pending),
  });
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors in the new file (fix any signature mismatch against the real data functions; do not change those functions).

- [ ] **Step 3: Commit**

```bash
git add src/lib/data/admin-attention.ts
git commit -m "Admin hub: attention aggregator with per-source failure isolation"
```

---

### Task 4: Breadcrumb nav replaces the pill rows

**Files:**
- Modify: `src/components/layout/nav-links.ts`
- Create: `A/admin-breadcrumb.tsx`
- Modify: `A/layout.tsx`
- Delete: `A/admin-nav.tsx`

**Interfaces:**
- Consumes: `getAdminLocation`, `resolveQuarterId`, `withQuarterParam`, `AdminNavItem` (Task 1); `QuarterSelect` (`quarters`, `selectedId`, `basePath`); `getQuarters()` rows have `id`, `name`, `is_active`; `getPendingTeamSubmissionCount()`
- Produces: `<AdminBreadcrumb pendingTeamCount: number; quarters: { id: string; name: string; is_active: boolean }[]; defaultQuarterId: string | null />`

- [ ] **Step 1: Update `nav-links.ts`**

In the `NavLink` interface, add after `keywords`:

```ts
  /** Admin pages whose data depends on `?quarter=`; the breadcrumb bar shows the quarter picker for these. */
  quarterScoped?: boolean;
```

In `ADMIN_NAV_LINKS`:
- Members: `href: "/portal/admin"` becomes `href: "/portal/admin/members"`.
- Add `quarterScoped: true,` to the Team Builder, Consultant Stats, Meeting Days and Rooms entries. The `Quarters` entry is one line; leave it. Meeting Days and Rooms are multi-line objects, so add the property in each. Team Page, Coffee Chats, Settings and Activity do not get it.

- [ ] **Step 2: Create the breadcrumb**

Create `A/admin-breadcrumb.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { QuarterSelect } from "@/components/quarter-select";
import { ADMIN_NAV_LINKS } from "@/components/layout/nav-links";
import { ADMIN_HUB_HREF, getAdminLocation, resolveQuarterId, withQuarterParam } from "@/lib/admin-nav";

export function AdminBreadcrumb({
  pendingTeamCount,
  quarters,
  defaultQuarterId,
}: {
  pendingTeamCount: number;
  quarters: { id: string; name: string; is_active: boolean }[];
  defaultQuarterId: string | null;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const location = getAdminLocation(pathname, ADMIN_NAV_LINKS);

  // The hub (and unknown paths) render their own header.
  if (!location) return null;

  const quarterParam = searchParams.get("quarter");
  const selectedQuarterId = resolveQuarterId(quarterParam, quarters, defaultQuarterId);
  const showPicker = !!location.page.quarterScoped && quarters.length > 0;

  return (
    <div className="space-y-3">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href={ADMIN_HUB_HREF} className="hover:text-foreground">
          Admin
        </Link>
        <ChevronRight className="size-3.5" />
        <span>{location.areaLabel}</span>
        <ChevronRight className="size-3.5" />
        <span aria-current="page" className="font-medium text-foreground">
          {location.page.label}
        </span>
      </nav>

      <div className="flex flex-wrap items-center justify-between gap-3">
        {location.siblings.length > 1 ? (
          <div className="inline-flex w-fit items-center gap-[3px] rounded-lg bg-muted p-[3px]">
            {location.siblings.map((item) => {
              const active = item.href === location.page.href;
              return (
                <Link
                  key={item.href}
                  href={withQuarterParam(item.href, item.quarterScoped ? quarterParam : null)}
                  className={cn(
                    "rounded-md px-3 py-1 text-sm font-medium whitespace-nowrap transition-colors",
                    active
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {item.label}
                  {item.href === "/portal/admin/team-page" && pendingTeamCount > 0 && (
                    <Badge className="ml-1.5 h-4 min-w-4 px-1 text-[10px]">{pendingTeamCount}</Badge>
                  )}
                </Link>
              );
            })}
          </div>
        ) : (
          <span />
        )}
        {showPicker && (
          <QuarterSelect quarters={quarters} selectedId={selectedQuarterId ?? ""} basePath={pathname} />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Update `A/layout.tsx`**

Replace the file with:

```tsx
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/data/profile";
import { isExec } from "@/lib/auth/roles";
import { getPendingTeamSubmissionCount } from "@/lib/data/team-page";
import { getQuarters } from "@/lib/data/quarters";
import { AdminBreadcrumb } from "./admin-breadcrumb";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile();
  if (!isExec(profile.role)) {
    redirect("/portal");
  }
  const [pendingTeamCount, quarters] = await Promise.all([
    getPendingTeamSubmissionCount(),
    getQuarters(),
  ]);
  const defaultQuarter = quarters.find((q) => q.is_active) ?? quarters[0] ?? null;

  return (
    <div className="space-y-6">
      <AdminBreadcrumb
        pendingTeamCount={pendingTeamCount}
        quarters={quarters.map((q) => ({ id: q.id, name: q.name, is_active: q.is_active }))}
        defaultQuarterId={defaultQuarter?.id ?? null}
      />
      {children}
    </div>
  );
}
```

- [ ] **Step 4: Delete the old nav**

```bash
git rm "src/app/portal/(app)/admin/admin-nav.tsx"
```

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors. (Until Task 5 the Members page is still at `/portal/admin` and the Members tab link points to `/portal/admin/members`; that is fixed next, so do not manually test navigation yet.)

- [ ] **Step 6: Commit**

```bash
git add -A src/components/layout/nav-links.ts "src/app/portal/(app)/admin"
git commit -m "Admin: breadcrumb with sibling tabs replaces the pill-tab rows"
```

---

### Task 5: Move Members to its own route and add the hub shell

**Files:**
- Move: `A/page.tsx` → `A/members/page.tsx`; `A/members-panel.tsx` → `A/members/members-panel.tsx`
- Create: `A/page.tsx` (hub), `A/hub/hub-header.tsx`, `A/hub/attention-list.tsx`

**Interfaces:**
- Consumes: `getAdminAttentionItems` (Task 3); `AttentionItem` (Task 2); `getQuarters`, `QuarterSelect`; `resolveQuarterId` (Task 1)
- Produces: `<HubHeader quarters selectedId subtitle />`, `<AttentionList items: AttentionItem[] />`; hub route at `/portal/admin`

- [ ] **Step 1: Move the Members files**

```bash
cd "src/app/portal/(app)/admin"
mkdir members
git mv page.tsx members/page.tsx
git mv members-panel.tsx members/members-panel.tsx
cd -
```

In `A/members/page.tsx` change `import { MembersPanel } from "./members-panel";` (it already resolves correctly because both files moved together; verify it still reads `./members-panel`). Leave everything else.

- [ ] **Step 2: Create `A/hub/hub-header.tsx`**

```tsx
import { QuarterSelect } from "@/components/quarter-select";
import { ADMIN_HUB_HREF } from "@/lib/admin-nav";

export function HubHeader({
  quarters,
  selectedId,
  subtitle,
}: {
  quarters: { id: string; name: string; is_active: boolean }[];
  selectedId: string | null;
  subtitle: string;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {quarters.length > 0 && (
          <QuarterSelect quarters={quarters} selectedId={selectedId ?? ""} basePath={ADMIN_HUB_HREF} />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create `A/hub/attention-list.tsx`**

```tsx
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AttentionItem } from "@/lib/admin-attention";

export function AttentionList({ items }: { items: AttentionItem[] }) {
  return (
    <section aria-labelledby="attention-heading" className="space-y-2">
      <h2
        id="attention-heading"
        className="text-xs font-semibold tracking-wide text-muted-foreground uppercase"
      >
        Needs attention{items.length > 0 ? ` · ${items.length}` : ""}
      </h2>
      {items.length === 0 ? (
        <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          <CheckCircle2 className="size-4 text-primary" />
          All clear. Nothing needs your attention right now.
        </div>
      ) : (
        <ul className="divide-y rounded-lg border border-amber-300/60 bg-amber-50/60 dark:border-amber-500/30 dark:bg-amber-950/20">
          {items.map((item) => (
            <li key={item.kind} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
              <span className="flex items-center gap-2">
                <span aria-hidden className="size-2 shrink-0 rounded-full bg-amber-500" />
                {item.label}
              </span>
              <Button
                size="sm"
                variant="outline"
                nativeButton={false}
                render={<Link href={item.href}>{item.actionLabel}</Link>}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Create the hub page `A/page.tsx`**

```tsx
import type { Metadata } from "next";
import { getQuarters } from "@/lib/data/quarters";
import { getAdminAttentionItems } from "@/lib/data/admin-attention";
import { resolveQuarterId } from "@/lib/admin-nav";
import { HubHeader } from "./hub/hub-header";
import { AttentionList } from "./hub/attention-list";

export const metadata: Metadata = { title: "Admin" };

export default async function AdminHubPage({
  searchParams,
}: {
  searchParams: Promise<{ quarter?: string }>;
}) {
  const { quarter } = await searchParams;
  const quarters = await getQuarters();
  const fallback = (quarters.find((q) => q.is_active) ?? quarters[0])?.id ?? null;
  const selectedId = resolveQuarterId(quarter, quarters, fallback);
  const selected = quarters.find((q) => q.id === selectedId) ?? null;

  const items = await getAdminAttentionItems(selectedId);

  return (
    <div className="space-y-8">
      <HubHeader
        quarters={quarters.map((q) => ({ id: q.id, name: q.name, is_active: q.is_active }))}
        selectedId={selectedId}
        subtitle={selected ? selected.name : "No quarter yet. Create one in Quarters."}
      />
      <AttentionList items={items} />
    </div>
  );
}
```

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit && npm run lint`
Then `npm run dev`, sign in as an exec:
- `/portal/admin` shows the hub header, quarter picker and the attention list (or "All clear").
- `/portal/admin/members` shows the existing Members page with breadcrumb `Admin › People › Members` and four sibling tabs including Team Page.
- Changing the picker on the hub reloads the hub with `?quarter=`.

- [ ] **Step 6: Commit**

```bash
git add -A "src/app/portal/(app)/admin"
git commit -m "Admin: hub shell with needs-attention list; Members moves to /portal/admin/members"
```

---

### Task 6: Hub quick actions, area cards and search

**Files:**
- Create: `A/hub/quick-actions.tsx`, `A/hub/area-cards.tsx`, `A/hub/hub-search-button.tsx`
- Modify: `A/page.tsx`, `A/hub/hub-header.tsx`, `src/components/layout/app-shell.tsx`, `A/coffee-chats/page.tsx`

**Interfaces:**
- Consumes: `ADMIN_AREA_LABELS`, `withQuarterParam` (Task 1); `ADMIN_NAV_LINKS`; `getPendingTeamSubmissionCount`
- Produces: `<QuickActions quarterId />`, `<AreaCards quarterId pendingTeamCount />`, `<HubSearchButton />`; window event name `"open-command-palette"`

- [ ] **Step 1: Let anything open the command palette**

In `src/components/layout/app-shell.tsx`, replace the keyboard `useEffect` (the one that registers `onKeyDown`) with:

```tsx
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandOpen((o) => !o);
      }
    }
    function onOpenRequest() {
      setCommandOpen(true);
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("open-command-palette", onOpenRequest);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("open-command-palette", onOpenRequest);
    };
  }, []);
```

- [ ] **Step 2: Create `A/hub/hub-search-button.tsx`**

```tsx
"use client";

import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";

export function HubSearchButton() {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="min-w-52 justify-between text-muted-foreground"
      onClick={() => window.dispatchEvent(new Event("open-command-palette"))}
    >
      <span className="flex items-center gap-2">
        <Search className="size-3.5" />
        Jump to or search…
      </span>
      <kbd className="rounded border px-1 text-[10px]">⌘K</kbd>
    </Button>
  );
}
```

Edit `A/hub/hub-header.tsx`: add `import { HubSearchButton } from "./hub-search-button";` and render `<HubSearchButton />` as the first child of the right-hand `div` (before the `quarters.length > 0` picker).

- [ ] **Step 3: Create `A/hub/quick-actions.tsx`**

```tsx
import Link from "next/link";
import { CalendarPlus, Coffee, KeyRound, UserPlus, type LucideIcon } from "lucide-react";
import { withQuarterParam } from "@/lib/admin-nav";

interface QuickAction {
  label: string;
  hint: string;
  href: string;
  icon: LucideIcon;
}

export function QuickActions({ quarterId }: { quarterId: string | null }) {
  const actions: QuickAction[] = [
    { label: "Add members", hint: "Bulk create accounts", href: "/portal/admin/members?action=bulk-add", icon: UserPlus },
    { label: "Reset a password", hint: "Find a member", href: "/portal/admin/members?action=find", icon: KeyRound },
    {
      label: "Add meeting day",
      hint: "Quarter calendar",
      href: withQuarterParam("/portal/admin/meeting-days", quarterId),
      icon: CalendarPlus,
    },
    {
      label: "Add coffee-chat slots",
      hint: "Recruitment schedule",
      href: "/portal/admin/coffee-chats?tab=schedule",
      icon: Coffee,
    },
  ];

  return (
    <section aria-labelledby="quick-actions-heading" className="space-y-2">
      <h2
        id="quick-actions-heading"
        className="text-xs font-semibold tracking-wide text-muted-foreground uppercase"
      >
        Quick actions
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {actions.map(({ label, hint, href, icon: Icon }) => (
          <Link
            key={label}
            href={href}
            className="flex items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground">
              <Icon className="size-4" />
            </span>
            <span>
              <span className="block text-sm font-medium">{label}</span>
              <span className="block text-xs text-muted-foreground">{hint}</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Create `A/hub/area-cards.tsx`**

```tsx
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { ADMIN_NAV_LINKS } from "@/components/layout/nav-links";
import { ADMIN_AREA_LABELS, withQuarterParam } from "@/lib/admin-nav";

export function AreaCards({
  quarterId,
  pendingTeamCount,
}: {
  quarterId: string | null;
  pendingTeamCount: number;
}) {
  return (
    <section aria-labelledby="areas-heading" className="space-y-2">
      <h2
        id="areas-heading"
        className="text-xs font-semibold tracking-wide text-muted-foreground uppercase"
      >
        Browse by area
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Object.entries(ADMIN_AREA_LABELS).map(([areaKey, areaLabel]) => (
          <div key={areaKey} className="rounded-lg border p-4">
            <h3 className="text-sm font-semibold">{areaLabel}</h3>
            <ul className="mt-2 space-y-1">
              {ADMIN_NAV_LINKS.filter((l) => l.group === areaKey).map((link) => (
                <li key={link.href}>
                  <Link
                    href={withQuarterParam(link.href, link.quarterScoped ? quarterId : null)}
                    className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
                  >
                    {link.label}
                    {link.href === "/portal/admin/team-page" && pendingTeamCount > 0 && (
                      <Badge className="ml-1.5 h-4 min-w-4 px-1 text-[10px]">{pendingTeamCount}</Badge>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Wire them into the hub page**

In `A/page.tsx` add imports:

```tsx
import { getPendingTeamSubmissionCount } from "@/lib/data/team-page";
import { QuickActions } from "./hub/quick-actions";
import { AreaCards } from "./hub/area-cards";
```

Replace the `const items = ...` line with:

```tsx
  const [items, pendingTeamCount] = await Promise.all([
    getAdminAttentionItems(selectedId),
    getPendingTeamSubmissionCount().catch(() => 0),
  ]);
```

and after `<AttentionList items={items} />` add:

```tsx
      <QuickActions quarterId={selectedId} />
      <AreaCards quarterId={selectedId} pendingTeamCount={pendingTeamCount} />
```

- [ ] **Step 6: Honor `?tab=schedule` on Coffee Chats**

In `A/coffee-chats/page.tsx`, change the signature and the `Tabs`:

```tsx
export default async function CoffeeChatsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
```

and `<Tabs defaultValue="availability">` becomes `<Tabs defaultValue={tab === "schedule" ? "schedule" : "availability"}>`.

- [ ] **Step 7: Verify**

Run: `npx tsc --noEmit && npm run lint`
In `npm run dev` as exec: hub shows four quick-action tiles and four area cards (Team Page shows a badge if submissions are pending); the search button opens the command palette; "Add coffee-chat slots" lands on the Schedule tab; ⌘K still works everywhere.

- [ ] **Step 8: Commit**

```bash
git add -A src "src/app/portal/(app)/admin"
git commit -m "Admin hub: quick actions, area cards, palette search button; Coffee Chats opens Schedule tab via ?tab"
```

---

### Task 7: One quarter picker (remove per-page pickers)

**Files:**
- Modify: `A/stats/page.tsx`, `A/team-builder/page.tsx`, `A/meeting-days/page.tsx`, `A/rooms/page.tsx`

The breadcrumb bar now shows the picker for these four pages (they are `quarterScoped`), so their own pickers go. This also removes the broken `basePath="/admin/..."` links.

- [ ] **Step 1: `A/stats/page.tsx`**

Remove the imports of `getQuarters` and `QuarterSelect`. Change the data load and header to:

```tsx
  const [{ quarter }, activeQuarter] = await Promise.all([searchParams, getActiveQuarter()]);

  const selectedQuarterId = quarter || activeQuarter?.id;
```

(adjust the import line to `import { getActiveQuarter } from "@/lib/data/quarters";`) and replace the header block with:

```tsx
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Consultant Stats</h1>
        <p className="text-sm text-muted-foreground">
          Attendance and task completion, rolled up per consultant.
        </p>
      </div>
```

(delete the surrounding `flex ... justify-between` wrapper and the `{quarters.length > 0 && (<QuarterSelect .../>)}` block).

- [ ] **Step 2: `A/team-builder/page.tsx`**

Remove `import { QuarterSelect } ...`. Replace the header block:

```tsx
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Sketch out roster drafts, then Finalize the one you want to apply.
        </p>
        <div className="flex items-center gap-2">
          <QuarterSelect
            quarters={quarters}
            selectedId={selectedQuarter.id}
            basePath="/admin/team-builder"
          />
          {plans.length > 0 && (
            <PlanSelect quarterId={selectedQuarter.id} plans={plans} selectedPlan={selectedPlan} />
          )}
        </div>
      </div>
```

with:

```tsx
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Sketch out roster drafts, then Finalize the one you want to apply.
        </p>
        {plans.length > 0 && (
          <PlanSelect quarterId={selectedQuarter.id} plans={plans} selectedPlan={selectedPlan} />
        )}
      </div>
```

- [ ] **Step 3: `A/meeting-days/page.tsx`**

Remove `import { QuarterSelect } ...`. Replace the header block with:

```tsx
      <p className="text-sm text-muted-foreground">
        Which days count as a meeting day for attendance tracking.
      </p>
```

(removing the `flex` wrapper and the `<QuarterSelect ... basePath="/admin/meeting-days" />`).

- [ ] **Step 4: `A/rooms/page.tsx`**

Remove `import { QuarterSelect } ...`. In the no-meeting-days early return, delete the `<QuarterSelect ... basePath="/admin/rooms" />` element (keep the `<div className="space-y-4">` and the paragraph). In the main return, replace the header block with:

```tsx
      <p className="text-sm text-muted-foreground">
        Which room each team is in for a meeting day -- visible to everyone.
      </p>
```

(removing the `flex` wrapper and the second `<QuarterSelect ... />`).

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit && npm run lint`
In dev as exec, on each of Stats, Team Builder, Meeting Days and Rooms: one picker (top-right of the breadcrumb bar), changing quarter reloads the same page with `?quarter=`, and the sibling tabs keep the chosen quarter. On Members, Settings, Activity, Coffee Chats and Team Page: no picker.

- [ ] **Step 6: Commit**

```bash
git add -A "src/app/portal/(app)/admin"
git commit -m "Admin: single quarter picker in the breadcrumb bar; drop per-page pickers (fixes broken /admin/* basePaths)"
```

---

### Task 8: Split the Members panel (no behavior change)

**Files:**
- Create: `A/members/member-types.ts`, `A/members/masked-secret.tsx`, `A/members/bulk-add-card.tsx`, `A/members/member-row.tsx`, `A/members/archived-members.tsx`
- Modify: `A/members/members-panel.tsx`

This task is a verbatim move. Cut each block by name from `A/members/members-panel.tsx`, paste into the new file, add `export` where needed, copy the original import block into each new file and delete imports until `npm run lint` reports no unused or missing imports. Do not change any logic or markup.

**Interfaces:**
- Produces:
  - `member-types.ts`: `export interface Member`, `export interface ArchivedMember`, `export const ROLE_OPTIONS`
  - `masked-secret.tsx`: `export function MaskedSecret({ value }: { value: string })`
  - `bulk-add-card.tsx`: `export function BulkAddCard({ defaultPassword }: { defaultPassword: string })` (contains `parseRows`, `bulkText`/`results` state, `onCreate`, and the "Add members" `<Card>`)
  - `member-row.tsx`: `export function MemberRow({ member, defaultPassword })` (plus `EditEmailDialog`, `ArchiveMemberDialog`, which stay unexported)
  - `archived-members.tsx`: `export function ArchivedSection({ archivedMembers })` (plus `ArchivedMemberRow`)

- [ ] **Step 1: Extract in this order**, running `npx tsc --noEmit` after each file:
  1. `member-types.ts`: `Member`, `ArchivedMember`, `ROLE_OPTIONS`.
  2. `masked-secret.tsx`: `MaskedSecret`. It is used by the bulk-add card and by the reset-password dialog inside `MemberRow`.
  3. `member-row.tsx`: `MemberRow`, `EditEmailDialog`, `ArchiveMemberDialog`.
  4. `archived-members.tsx`: `ArchivedSection`, `ArchivedMemberRow`.
  5. `bulk-add-card.tsx`: `parseRows` and the "Add members" `<Card>` with its `bulkText`, `results`, `isPending` state and `onCreate`. `MembersPanel` renders `<BulkAddCard defaultPassword={defaultPassword} />` in its place.
  6. What remains in `members-panel.tsx`: sort accessors, `SortableMemberHead`, filter state, and the members table `<Card>`. It imports the extracted pieces.

- [ ] **Step 2: Verify nothing changed**

Run: `npx tsc --noEmit && npm run lint && npm test`
Then in dev as exec on `/portal/admin/members`: page looks and behaves exactly as before (bulk add card, table, role dropdown + confirm, Edit email, Reset password, Archive, archived section expand/restore/delete).

- [ ] **Step 3: Commit**

```bash
git add -A "src/app/portal/(app)/admin/members"
git commit -m "Members: split the panel into focused files (no behavior change)"
```

---

### Task 9: Members declutter

**Files:**
- Modify: `src/components/list-search.tsx`, `A/members/page.tsx`, `A/members/members-panel.tsx`, `A/members/member-row.tsx`, `A/members/archived-members.tsx`
- Rename + modify: `A/members/bulk-add-card.tsx` → `A/members/bulk-add-dialog.tsx`

**Interfaces:**
- Consumes: `parseMembersAction`, `MembersAction` (Task 1); Task 8 files; `Dialog*`, `Tabs*`, `Select*` from `@/components/ui/*`
- Produces: `<BulkAddDialog defaultPassword defaultOpen />`; `<MembersPanel members archivedMembers defaultPassword action />`; `<ListSearch autoFocus? />`

- [ ] **Step 1: `ListSearch` autoFocus**

In `src/components/list-search.tsx` add `autoFocus = false` to the props (type `autoFocus?: boolean`) and pass `autoFocus={autoFocus}` to the `<Input>`.

- [ ] **Step 2: Page reads the action**

Replace `A/members/page.tsx` with:

```tsx
import type { Metadata } from "next";
import { getAllProfiles, getArchivedProfiles } from "@/lib/data/members";
import { getDefaultBulkPassword } from "@/lib/data/org-settings";
import { parseMembersAction } from "@/lib/admin-nav";
import { MembersPanel } from "./members-panel";

export const metadata: Metadata = { title: "Admin · Members" };

export default async function AdminMembersPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string }>;
}) {
  const [{ action }, members, archivedMembers, defaultPassword] = await Promise.all([
    searchParams,
    getAllProfiles(),
    getArchivedProfiles(),
    getDefaultBulkPassword(),
  ]);
  return (
    <MembersPanel
      members={members}
      archivedMembers={archivedMembers}
      defaultPassword={defaultPassword}
      action={parseMembersAction(action)}
    />
  );
}
```

- [ ] **Step 3: Bulk add becomes a dialog**

```bash
git mv "src/app/portal/(app)/admin/members/bulk-add-card.tsx" "src/app/portal/(app)/admin/members/bulk-add-dialog.tsx"
```

In `bulk-add-dialog.tsx`: rename the component to `BulkAddDialog`, change its props to `{ defaultPassword, defaultOpen = false }: { defaultPassword: string; defaultOpen?: boolean }`, add `const [open, setOpen] = useState(defaultOpen);`, and replace the outer `<Card>…</Card>` wrapper with:

```tsx
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Bulk add
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add members</DialogTitle>
            <DialogDescription>
              One per line: <code>Name, email@180dc.org</code>. New accounts get the default
              password <MaskedSecret value={defaultPassword} /> and a consultant role, and are
              forced to set their own password on first login. Change the default password in
              Settings.
            </DialogDescription>
          </DialogHeader>
          {/* keep the existing Textarea, row-count + Create accounts row, and results table
              exactly as they were inside the old CardContent */}
        </DialogContent>
      </Dialog>
    </>
```

Move the old `CardContent` children (textarea, count/button row, results table) inside `DialogContent` after the header, wrapped in `<div className="space-y-4">`. Remove now-unused `Card*` imports; add `Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle` from `@/components/ui/dialog` (match the import already used in `member-row.tsx`).

- [ ] **Step 4: Role moves into a dialog (in `member-row.tsx`)**

Add this component to `member-row.tsx` (uses `useState`, `Select*`, `Dialog*`, `Button`, `ROLE_LABELS`, `roleLabel`, `ROLE_OPTIONS`; all already imported or importable from the same modules the file uses):

```tsx
function ChangeRoleDialog({
  open,
  onOpenChange,
  memberName,
  currentRole,
  isPending,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  memberName: string;
  currentRole: UserRole;
  isPending: boolean;
  onSubmit: (role: UserRole) => void;
}) {
  const [role, setRole] = useState<UserRole>(currentRole);

  function handleOpenChange(next: boolean) {
    if (next) setRole(currentRole);
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change {memberName}&apos;s role</DialogTitle>
          <DialogDescription>Currently {roleLabel(currentRole)}.</DialogDescription>
        </DialogHeader>
        <Select value={role} onValueChange={(v) => v && setRole(v as UserRole)}>
          <SelectTrigger size="sm" className="w-full">
            <SelectValue>{(value: UserRole) => roleLabel(value)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {ROLE_OPTIONS.map((r) => (
              <SelectItem key={r} value={r}>
                {ROLE_LABELS[r]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button disabled={isPending || role === currentRole} onClick={() => onSubmit(role)}>
            Change role
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

In `MemberRow`:
- Remove `roleChangeOpen`, `pendingRole`, `onRoleSelect`, `onConfirmRoleChange`; add `const [roleOpen, setRoleOpen] = useState(false);` and:

```tsx
  function onChangeRole(role: UserRole) {
    startTransition(async () => {
      const result = await updateMemberRole(member.id, role);
      if (result?.error) toast.error(result.error);
      else {
        setRoleOpen(false);
        toast.success("Role updated.");
      }
    });
  }
```

- Replace the whole role `<TableCell>` (the `Select` plus its `AlertDialog`) with `<TableCell>{roleLabel(member.role)}</TableCell>`.
- In the ⋯ `DropdownMenuContent`, add as the first item `<DropdownMenuItem onClick={() => setRoleOpen(true)}>Change role…</DropdownMenuItem>`, and render next to `EditEmailDialog`:

```tsx
        <ChangeRoleDialog
          open={roleOpen}
          onOpenChange={setRoleOpen}
          memberName={member.name}
          currentRole={member.role}
          isPending={isPending}
          onSubmit={onChangeRole}
        />
```

- Remove unused `AlertDialog*` imports only if nothing else in the file uses them (the reset-password dialog does, so they likely stay).

- [ ] **Step 5: Tabs, chips and header in `members-panel.tsx`**

Add props `action: MembersAction | null` (type import from `@/lib/admin-nav`). Remove the role `Select` filter and its imports if unused. Add:

```tsx
const ROLE_CHIPS: { value: UserRole | "all"; label: string }[] = [
  { value: "all", label: "All" },
  ...ROLE_OPTIONS.map((r) => ({ value: r, label: ROLE_LABELS[r] })),
];
```

Replace the returned JSX with:

```tsx
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Members</h1>
          <p className="text-sm text-muted-foreground">
            {members.length} active · {archivedMembers.length} archived
          </p>
        </div>
        <BulkAddDialog defaultPassword={defaultPassword} defaultOpen={action === "bulk-add"} />
      </div>

      <Tabs defaultValue="active">
        <TabsList>
          <TabsTrigger value="active">Active {members.length}</TabsTrigger>
          <TabsTrigger value="archived">Archived {archivedMembers.length}</TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="space-y-4 pt-4">
          <div className="flex flex-wrap items-center gap-3">
            <ListSearch
              value={query}
              onChange={setQuery}
              placeholder="Search name or email..."
              className="w-64"
              autoFocus={action === "find"}
            />
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by role">
              {ROLE_CHIPS.map((chip) => {
                const active = roleFilter === chip.value;
                return (
                  <button
                    key={chip.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setRoleFilter(chip.value)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                      active
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {chip.label}
                  </button>
                );
              })}
            </div>
          </div>
          {/* existing <Table> with SortableMemberHead columns and MemberRow rows, unchanged */}
        </TabsContent>

        <TabsContent value="archived" className="pt-4">
          <ArchivedSection archivedMembers={archivedMembers} />
        </TabsContent>
      </Tabs>
    </div>
```

Keep the existing `<Table>…</Table>` block where the comment sits (drop its enclosing `Card`/`CardContent`). Import `Tabs, TabsContent, TabsList, TabsTrigger` from `@/components/ui/tabs`.

- [ ] **Step 6: Un-collapse the archived table (`archived-members.tsx`)**

Change `ArchivedSection` to a plain table: remove the `open` state, the clickable header button, the chevron icons and the surrounding `Card`; return just the `<Table>…</Table>` (header row and `ArchivedMemberRow` mapping unchanged). Drop unused imports (`ChevronDown`, `ChevronRight`, `Card*`).

- [ ] **Step 7: Verify**

Run: `npx tsc --noEmit && npm run lint && npm test`
In dev as exec on `/portal/admin/members`:
- Header shows count and **Bulk add**; the dialog creates accounts as before and shows per-row results.
- `?action=bulk-add` opens the dialog on load; `?action=find` focuses the search box; `?action=nonsense` does neither.
- Role chips filter the table; role is plain text; ⋯ has Change role…, Edit email, Reset password, Archive; changing a role updates the row.
- Active/Archived tabs show counts; Archived shows the restore/delete table directly.
- Narrow the window to phone width: header, chips and table remain usable (table scrolls inside its container, not the page).

- [ ] **Step 8: Commit**

```bash
git add -A src "src/app/portal/(app)/admin/members"
git commit -m "Members: bulk add in a dialog, Active/Archived tabs, role chips, role change in the row menu, ?action deep links"
```

---

### Task 10: Final verification

**Files:** none (fixes only if something fails)

- [ ] **Step 1: Full checks**

Run: `npm test && npm run lint && npm run build`
Expected: all green. If the build warns that `useSearchParams` needs a Suspense boundary, wrap `<AdminBreadcrumb ... />` in `A/layout.tsx` with `<Suspense fallback={null}>` (import from `react`).

- [ ] **Step 2: Walkthrough (exec account), checking each item**

- Hub: needs-attention rows match reality (cross-check one against its source page); "All clear" appears when no condition holds; picker switches quarter; search button opens the palette.
- Every area-card link, quick action and sibling tab navigates correctly; the Team Page badge shows on the breadcrumb tab and the hub card when submissions are pending.
- Quarter persists across Stats, Team Builder, Meeting Days and Rooms via the tabs and picker; none of those pages has its own picker; a garbage `?quarter=zzz` falls back to the active quarter without crashing.
- Non-exec account: `/portal/admin` and `/portal/admin/members` redirect to `/portal`.
- Dark mode and phone width on the hub and Members.
- Members flows end to end: bulk add, change role, edit email, reset password, archive, restore, permanent delete.

- [ ] **Step 3: Record results and push**

If any check needed a code fix, commit it (`git commit -am "Admin redesign: fix <what>"`). Then:

```bash
git push
```

Report the checks run and their results.
