# Portal Foundation + Dashboard Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the portal's glass/blur/gradient visual system with a flat, bordered, white-and-green one; restructure the sidebar into 4 legible nav groups; unify status indicators (health/priority) into one signal-dot language; and rebuild the dashboard as the flagship page proving out all of it.

**Architecture:** No data, route, or business-logic changes. This is a presentation-layer pass: (1) re-theme design tokens and the ~7 shared UI primitives that cascade across nearly every page (`Card`, `Dialog`, `AlertDialog`, `Popover`, `DropdownMenu`, `Select`, `Tabs`), (2) introduce two small shared components (`SignalDot`, `PageHeader`), (3) restructure the nav shell (`nav-links.ts`, `sidebar-nav.tsx`, `app-shell.tsx`), (4) rebuild the dashboard page on top of all of the above, (5) sweep the remaining chrome (command palette, onboarding tour) for leftover glass/uppercase artifacts.

**Tech Stack:** Next.js (see `AGENTS.md` — this project's Next.js has local breaking changes vs. training data; consult `node_modules/next/dist/docs/` before touching anything that isn't a plain component/JSX/Tailwind edit — no task in this plan adds routes, data fetching patterns, or server actions, so this should not come up, but check if something behaves unexpectedly), React Server Components, Tailwind CSS v4 (`@theme inline` token system), base-ui/react (headless primitives beneath `components/ui/*`), class-variance-authority.

**Spec:** `docs/superpowers/specs/2026-09-11-internal-portal-redesign-design.md`

## Global Constraints

- **No feature removal.** Every alert, stat, list, card, and admin capability that exists today must still exist and be reachable after this plan. Changes are to presentation and organization only.
- **White-and-green stays dominant.** New tokens: `paper` background `#F5F6F2`, `ink` text `#1B1F1C`, `surface`/card `#FFFFFF`, accent `moss` `#3F6B2A`. Amber (`--warning`, unchanged `#B45309`) and the existing `--destructive` red are reserved strictly for status signals, never decoration.
- **Breezy and modern, not austere.** Flat/bordered is a move toward clarity, not toward a dense enterprise-utilitarian look. Keep whitespace, keep existing interaction motion (hover states, sheet/dialog open transitions, tab switches) — do not strip motion, only the blur/gradient/shadow decoration.
- **Marketing is out of scope and must not visually change.** `Card`, `Dialog`, `AlertDialog`, `Popover`, `DropdownMenu`, `Select`, and `Tabs` are confirmed unused anywhere under `src/app/(marketing)` or `src/components/marketing` — safe to edit directly. `Button` (`components/ui/button.tsx`) and `Sheet` (`components/ui/sheet.tsx`) **are** used by marketing directly and must not be edited at the shared-component level in this plan — any portal-specific flattening of Sheet happens via override classes at the portal's own call site only.
- **No automated UI test suite exists** (the one test file, `src/lib/attendance.test.ts`, is business-logic-only and is not touched by this plan). Every task's verification step is a manual check with the dev server — run `npm run dev` and inspect the affected page/component in light mode, dark mode, and at a mobile width (~400px), confirming no visual regression and no missing content.

---

### Task 1: Flatten design tokens

**Files:**
- Modify: `src/app/globals.css`

**Interfaces:**
- Produces: the retuned `--background`, `--foreground`, `--card`, `--popover`, `--primary`, `--secondary`, `--muted`, `--accent`, `--border`, `--input`, `--ring`, `--chart-1` tokens (light + dark) that every later task's Tailwind classes (`bg-card`, `ring-border`, `bg-primary`, etc.) resolve against. Removes `--sidebar-*` and `--glass-*-shadow` custom properties and the `.glass-panel` / `.glass-overlay` / `.glass-sidebar` classes — Task 2 and Task 5 depend on these being gone so nothing can accidentally reference them.
- Does not touch: `--warm`, `--warm-foreground`, `--mint`, `--destructive`, `--radius*`, `--chart-2..5`, `.marketing-light`, `.dark .marketing-light` (marketing-only, confirmed via `grep -rln "mint-panel\|bg-warm\|text-warm" src` — only `(marketing)` pages match).

- [ ] **Step 1: Replace the `:root` token block**

In `src/app/globals.css`, replace the `:root { ... }` block (currently lines 56-102) with:

```css
:root {
  --background: #f5f6f2;
  --foreground: #1b1f1c;
  --card: #ffffff;
  --card-foreground: #1b1f1c;
  --popover: #ffffff;
  --popover-foreground: #1b1f1c;
  --primary: #3f6b2a;
  --primary-foreground: #ffffff;
  --secondary: #edeeea;
  --secondary-foreground: #1b1f1c;
  --muted: #edeeea;
  --muted-foreground: #5b6058;
  --accent: #e8f0e0;
  --accent-foreground: #2f4f20;
  --destructive: oklch(0.577 0.245 27.325);
  --warning: #b45309;
  --warm: #c2571f;
  --warm-foreground: #fff8f3;
  --mint: #e3efd7;
  --border: #dee1db;
  --input: #dee1db;
  --ring: #3f6b2a;
  --chart-1: #3f6b2a;
  --chart-2: oklch(0.556 0 0);
  --chart-3: oklch(0.439 0 0);
  --chart-4: oklch(0.371 0 0);
  --chart-5: oklch(0.269 0 0);
  --radius: 0.5rem;
}
```

This drops `--glass-panel-shadow` / `--glass-overlay-shadow` / `--glass-sidebar-shadow` and all `--sidebar-*` properties entirely (Task 2 removes their last consumers; Task 5 removes the `--sidebar-*` consumers).

- [ ] **Step 2: Replace the `.dark` token block**

Replace the `.dark { ... }` block (currently lines 104-148) with:

```css
.dark {
  --background: #14171a;
  --foreground: #f2f4f0;
  --card: #1c1f1c;
  --card-foreground: #f2f4f0;
  --popover: #1c1f1c;
  --popover-foreground: #f2f4f0;
  --primary: #7fb055;
  --primary-foreground: #12200a;
  --secondary: #262a26;
  --secondary-foreground: #f2f4f0;
  --muted: #262a26;
  --muted-foreground: #9aa096;
  --accent: #23301a;
  --accent-foreground: #a9d080;
  --destructive: oklch(0.704 0.191 22.216);
  --warning: #fbbf24;
  --warm: #ff9a66;
  --warm-foreground: #341206;
  --border: color-mix(in oklch, white 12%, transparent);
  --input: color-mix(in oklch, white 15%, transparent);
  --ring: #7fb055;
  --chart-1: #7fb055;
  --chart-2: oklch(0.556 0 0);
  --chart-3: oklch(0.439 0 0);
  --chart-4: oklch(0.371 0 0);
  --chart-5: oklch(0.269 0 0);
}
```

Do not touch `.marketing-light` or `.dark .marketing-light` below this block — leave both exactly as they are (marketing pins its own independent light-mode palette regardless of the portal's theme).

- [ ] **Step 3: Remove the now-unused `--color-sidebar-*` mappings from `@theme inline`**

In the `@theme inline { ... }` block near the top of the file, delete these 7 lines (they map Tailwind color utilities to the `--sidebar-*` custom properties just removed):

```css
  --color-sidebar-ring: var(--sidebar-ring);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar: var(--sidebar);
```

- [ ] **Step 4: Delete the ambient gradient wash and the glass utility classes**

In the `@layer base { ... }` block, delete the entire `body::before { ... }` rule (the "vivid, fixed ambient light" gradient wash — its own comment says it exists for "the glass panels [to] refract," so it has no purpose once those panels are gone; confirmed safe because the marketing layout wraps every page in its own opaque `bg-background` div, so `body::before` never painted through to marketing anyway).

In the `@layer components { ... }` block, delete the `.glass-panel`, `.glass-overlay`, and `.glass-sidebar` rule blocks entirely (Task 2 replaces every consumer of these three classes with plain Tailwind utilities).

- [ ] **Step 5: Verify**

Run `npm run dev`, open `/portal` (or any page — it will look broken/unstyled for `Card`/`Dialog` consumers until Task 2 lands, that's expected). Confirm the page loads with no CSS build errors in the terminal, and that the background is now the new flat off-white/near-black paper tone instead of the old ambient gradient.

- [ ] **Step 6: Commit**

```bash
git add src/app/globals.css
git commit -m "Flatten portal design tokens, drop glass/gradient system

Retunes background/foreground/card/primary/etc to the flat
white-and-moss-green palette, removes the sidebar-specific token
set (only consumer is being rewritten in a later task), and deletes
the ambient gradient wash and .glass-panel/.glass-overlay/.glass-sidebar
utility classes. Marketing's own light-mode palette is untouched.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UDgMsa1SX6qHqFhYPDHEpn"
```

---

### Task 2: Flatten shared UI primitives

**Files:**
- Modify: `src/components/ui/card.tsx:15`
- Modify: `src/components/ui/dialog.tsx:56`
- Modify: `src/components/ui/alert-dialog.tsx:55`
- Modify: `src/components/ui/popover.tsx:40`
- Modify: `src/components/ui/dropdown-menu.tsx:44`
- Modify: `src/components/ui/select.tsx:86`
- Modify: `src/components/ui/tabs.tsx:31`

**Interfaces:**
- Consumes: the `--card`, `--popover`, `--border` tokens from Task 1.
- Produces: every page in the app that renders a `Card`, `Dialog`, `AlertDialog`, `Popover`, `DropdownMenu`, `Select`, or `Tabs` (confirmed via `grep -rlc "components/ui/card" src/app/portal` — 16+ portal files, plus every dialog/menu/select/tabs usage app-wide) now renders flat and bordered instead of glass/blurred, with zero per-page changes required. This is the single highest-leverage task in the plan.
- Does NOT touch `components/ui/button.tsx` or `components/ui/sheet.tsx` — both are consumed directly by the marketing site (`grep -rln "components/ui/sheet\|components/ui/button" "src/app/(marketing)" src/components/marketing` confirms this) and must not be edited here.

- [ ] **Step 1: Card**

In `src/components/ui/card.tsx`, in the `Card` function's `className`, replace:

```
"glass-panel group/card flex flex-col gap-(--card-spacing) ...
```

with:

```
"bg-card ring-1 ring-border group/card flex flex-col gap-(--card-spacing) ...
```

(keep the rest of the class string — `overflow-hidden rounded-xl py-(--card-spacing) text-sm text-card-foreground [--card-spacing:--spacing(4)] has-data-[slot=card-footer]:pb-0 has-[>img:first-child]:pt-0 data-[size=sm]:[--card-spacing:--spacing(3)] data-[size=sm]:has-data-[slot=card-footer]:pb-0 *:[img:first-child]:rounded-t-xl *:[img:last-child]:rounded-b-xl` — unchanged, only the leading `glass-panel` token is replaced).

- [ ] **Step 2: Dialog**

In `src/components/ui/dialog.tsx:56`, replace the leading `"glass-overlay` with `"bg-popover ring-1 ring-border` in the `DialogContent` className string. Leave the `bg-black/10 ... supports-backdrop-filter:backdrop-blur-xs` scrim rule (line 34, the dimming backdrop behind the dialog, not the dialog panel itself) untouched — that's a standard, functional focus-shift affordance, not the glass-panel decoration this task targets.

- [ ] **Step 3: AlertDialog**

Same change in `src/components/ui/alert-dialog.tsx:55` — replace leading `"glass-overlay` with `"bg-popover ring-1 ring-border`. Leave its scrim rule (line 33) untouched, same reasoning as Step 2.

- [ ] **Step 4: Popover**

Same change in `src/components/ui/popover.tsx:40` — replace leading `"glass-overlay` with `"bg-popover ring-1 ring-border`.

- [ ] **Step 5: DropdownMenu**

Same change in `src/components/ui/dropdown-menu.tsx:44` — replace leading `"glass-overlay` with `"bg-popover ring-1 ring-border`.

- [ ] **Step 6: Select**

Same change in `src/components/ui/select.tsx:86` — replace leading `"glass-overlay` with `"bg-popover ring-1 ring-border`.

- [ ] **Step 7: Tabs**

In `src/components/ui/tabs.tsx:31`, in the `tabsListVariants` `default` variant, replace:

```
default: "bg-foreground/5 ring-1 ring-foreground/10 backdrop-blur-md",
```

with:

```
default: "bg-muted ring-1 ring-border",
```

- [ ] **Step 8: Verify**

Run `npm run dev`. Open `/portal` — dashboard cards should now render as flat white panels with a thin border, no blur, no shadow. Open the command palette (⌘K) and the account-avatar dropdown menu in the header — both should be flat/bordered, not translucent. Check light mode, dark mode, and mobile width. Confirm nothing in `(marketing)` changed (spot-check the homepage — its buttons and any Sheet-based mobile menu should look exactly as before, since `button.tsx`/`sheet.tsx` weren't touched).

- [ ] **Step 9: Commit**

```bash
git add src/components/ui/card.tsx src/components/ui/dialog.tsx src/components/ui/alert-dialog.tsx src/components/ui/popover.tsx src/components/ui/dropdown-menu.tsx src/components/ui/select.tsx src/components/ui/tabs.tsx
git commit -m "Flatten Card/Dialog/Popover/DropdownMenu/Select/Tabs surfaces

Swaps the glass-panel/glass-overlay treatment (blur, translucency,
soft shadow) for a flat bg + hairline border on the shared primitives
that cascade across nearly every portal page. Button and Sheet are
deliberately untouched here since marketing consumes them directly.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UDgMsa1SX6qHqFhYPDHEpn"
```

---

### Task 3: Unify status signals into one dot language

**Files:**
- Create: `src/components/signal-dot.tsx`
- Modify: `src/lib/project-labels.ts`
- Modify: `src/components/health-badge.tsx`

**Interfaces:**
- Produces: `SignalDot({ dotClassName: string; label: string; className?: string })` — a small dot + label, exported from `src/components/signal-dot.tsx`. `dotClassName` takes the exact Tailwind background-color class from whichever domain map is calling it (mirrors the pattern already established in `src/components/task-row.tsx:122`, which inlines the same dot markup by hand today). `project-labels.ts` gains `HEALTH_DOT_CLASS: Record<ProjectHealth, string>` and loses `HEALTH_BADGE_CLASS` (confirmed via `grep -rln "HEALTH_BADGE_CLASS" src` that `health-badge.tsx` is its only consumer). `TASK_PRIORITY_DOT_CLASS.medium` changes from the hardcoded `bg-amber-500` to the themed `bg-warning` token.
- Consumes: nothing new.
- Task 6 (dashboard) consumes `SignalDot` and `TASK_PRIORITY_DOT_CLASS` directly. `HealthBadge` is consumed by 5 files today (`page.tsx`, `clients/[id]/page.tsx`, `projects/project-table.tsx`, `projects/project-board.tsx`, `projects/[id]/project-header.tsx`) — none of those call sites change; they all pick up the new dot rendering automatically because `HealthBadge`'s internals change, not its signature.

- [ ] **Step 1: Create the `SignalDot` component**

Create `src/components/signal-dot.tsx`:

```tsx
import { cn } from "@/lib/utils";

/**
 * A colored dot + label -- the shared visual language for status signals
 * (project health, task priority, overdue) across the portal. Callers
 * supply the exact dot color class from their own domain's label map (e.g.
 * HEALTH_DOT_CLASS, TASK_PRIORITY_DOT_CLASS) rather than an abstract tone,
 * so this stays a thin rendering helper, not a second status taxonomy.
 */
export function SignalDot({
  dotClassName,
  label,
  className,
}: {
  dotClassName: string;
  label: string;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-sm", className)}>
      <span className={cn("size-1.5 shrink-0 rounded-full", dotClassName)} aria-hidden="true" />
      {label}
    </span>
  );
}
```

- [ ] **Step 2: Update `project-labels.ts`**

In `src/lib/project-labels.ts`, delete the `HEALTH_BADGE_CLASS` export:

```ts
export const HEALTH_BADGE_CLASS: Record<ProjectHealth, string> = {
  on_track: "bg-primary/10 text-primary border-transparent",
  at_risk: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-transparent",
  blocked: "bg-destructive/10 text-destructive border-transparent",
};
```

Replace it with:

```ts
export const HEALTH_DOT_CLASS: Record<ProjectHealth, string> = {
  on_track: "bg-primary",
  at_risk: "bg-warning",
  blocked: "bg-destructive",
};
```

Then update `TASK_PRIORITY_DOT_CLASS` (a few lines below) so `medium` uses the themed warning token instead of a hardcoded Tailwind color:

```ts
export const TASK_PRIORITY_DOT_CLASS: Record<TaskPriority, string> = {
  low: "bg-muted-foreground/40",
  medium: "bg-warning",
  high: "bg-destructive",
};
```

- [ ] **Step 3: Rewrite `HealthBadge`**

Replace the full contents of `src/components/health-badge.tsx`:

```tsx
import { SignalDot } from "@/components/signal-dot";
import { HEALTH_DOT_CLASS, HEALTH_LABELS } from "@/lib/project-labels";
import type { ProjectHealth } from "@/lib/supabase/database.types";

export function HealthBadge({ health }: { health: ProjectHealth }) {
  return <SignalDot dotClassName={HEALTH_DOT_CLASS[health]} label={HEALTH_LABELS[health]} />;
}
```

- [ ] **Step 4: Verify**

Run `npm run dev`. Every place `HealthBadge` renders (dashboard's "My teams" list, `/portal/projects`, `/portal/clients/[id]`, a project detail page header) should now show a small colored dot + text instead of a tinted pill badge, in both light and dark mode. Confirm `task-row.tsx` (which still inlines its own dot markup, untouched by this task) visually matches the new `SignalDot` output — same dot size (`size-1.5`), same gap.

- [ ] **Step 5: Commit**

```bash
git add src/components/signal-dot.tsx src/lib/project-labels.ts src/components/health-badge.tsx
git commit -m "Unify health/priority status into one signal-dot language

Formalizes the dot+label pattern task-row.tsx already used for task
priority into a shared SignalDot component, and switches HealthBadge
from a tinted pill Badge to the same dot language -- every existing
consumer of HealthBadge picks this up automatically.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UDgMsa1SX6qHqFhYPDHEpn"
```

---

### Task 4: Build the shared `PageHeader` component

**Files:**
- Create: `src/components/layout/page-header.tsx`

**Interfaces:**
- Produces: `PageHeader({ title: string; description?: string; action?: ReactNode })`, a faithful extraction of the inline `<h1 className="text-2xl font-semibold tracking-tight">...</h1><p className="text-sm text-muted-foreground">...</p>` pattern already used identically across `attendance/page.tsx`, `clients/page.tsx`, `quick-links/page.tsx`, `projects/page.tsx`, `tasks/page.tsx`, `resources/page.tsx`, `directory/page.tsx`, and `admin/layout.tsx` — so it's a drop-in replacement with an added optional trailing action slot for pages that have one primary action.
- Task 6 (dashboard) is the only consumer added in this plan; migrating the other pages listed above to use it is follow-up work (they're unaffected either way — nothing in this plan requires them to change).

- [ ] **Step 1: Create the component**

Create `src/components/layout/page-header.tsx`:

```tsx
import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
```

- [ ] **Step 2: Verify**

This component has no consumers yet (Task 6 adds the first one), so there's nothing to visually check until then. Run `npx tsc --noEmit` (or the project's existing typecheck script, if `package.json` defines one under a different name — check `package.json`'s `scripts` block first) to confirm the new file compiles with no type errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/page-header.tsx
git commit -m "Add shared PageHeader component

Extracts the page-title pattern already repeated identically across
8 portal pages into one component with an optional trailing action
slot, for the dashboard rebuild to consume first.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UDgMsa1SX6qHqFhYPDHEpn"
```

---

### Task 5: Restructure the navigation shell

**Files:**
- Modify: `src/components/layout/nav-links.ts`
- Modify: `src/components/layout/sidebar-nav.tsx`
- Modify: `src/components/layout/app-shell.tsx`

**Interfaces:**
- Consumes: `--border`, `--muted`, `--primary` tokens from Task 1.
- Produces: `NavLink.group` gains a `"reference"` member; `Resources` and `Quick Links` are tagged with it. Same 10 destinations, same depth — only the grouping/labels/active-state visuals change. `OnboardingTour`'s `tourSteps` (built from `NAV_LINKS` in `app-shell.tsx`) keeps working unmodified since it only reads `href`/`label`/`tourDescription`, none of which change.

- [ ] **Step 1: Add the `"reference"` group and tag Resources/Quick Links**

In `src/components/layout/nav-links.ts`, update the `NavLink` interface's `group` field:

```ts
  /** Sidebar grouping only -- unset means "ungrouped" (rendered on its own). */
  group?: "work" | "people" | "reference";
```

Then add `group: "reference"` to the Resources and Quick Links entries in `NAV_LINKS`:

```ts
  {
    href: "/portal/resources",
    label: "Resources",
    icon: BookOpen,
    group: "reference",
    tourDescription: "The chapter wiki -- training docs, templates, and guides.",
  },
  {
    href: "/portal/quick-links",
    label: "Quick Links",
    icon: Link2,
    keywords: "drive docs slack outside resources",
    group: "reference",
    tourDescription: "Fast access to shared docs, Drive folders, and other outside resources.",
  },
```

(Only the `group: "reference"` line is added to each; every other field on these two entries is unchanged.)

- [ ] **Step 2: Rewrite `sidebar-nav.tsx`'s group label and active-state styling**

In `src/components/layout/sidebar-nav.tsx`:

Replace the `GROUP_LABEL` constant:

```ts
const GROUP_LABEL: Record<string, string> = { work: "Work", people: "People", reference: "Reference" };
```

Replace the nav-link `linkEl` className logic (currently the `bg-primary/15 text-primary ring-1 ring-primary/30` / `text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground` block) with a left-accent-bar treatment that reserves the border's width at rest so nothing shifts on activation:

```tsx
    const linkEl = (
      <Link
        id={`nav-link-${link.href}`}
        href={link.href}
        onClick={onNavigate}
        aria-label={collapsed ? link.label : undefined}
        className={cn(
          "flex items-center gap-2.5 rounded-md py-2 text-sm font-medium transition-colors",
          collapsed
            ? cn("justify-center px-0", active ? "bg-primary/12 text-primary" : "text-foreground/70 hover:bg-muted hover:text-foreground")
            : cn(
                "border-l-2 pr-3 pl-[10px]",
                active
                  ? "border-primary bg-primary/8 text-primary"
                  : "border-transparent text-foreground/70 hover:bg-muted hover:text-foreground",
              ),
        )}
      >
        <Icon className="size-4 shrink-0" />
        {!collapsed && link.label}
      </Link>
    );
```

Replace the group-label paragraph (drop the uppercase/tracking treatment — sentence-case only, no dot: a category heading has no status to signal):

```tsx
        {showGroupLabel && (
          <p className="px-3 pt-3 pb-1 text-xs font-medium text-muted-foreground">
            {GROUP_LABEL[link.group!]}
          </p>
        )}
```

Replace the divider's border color:

```tsx
        {showDivider && <div className="mx-1 my-2 border-t border-border" />}
```

Replace the three occurrences of `text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground` (the replay-tour and collapse-toggle icon buttons, both collapsed and expanded variants) with `text-muted-foreground hover:bg-muted hover:text-foreground`.

- [ ] **Step 3: Rewrite `app-shell.tsx`'s shell containers**

In `src/components/layout/app-shell.tsx`:

Replace the root container (currently `<div className="flex min-h-svh md:gap-3 md:p-3">`) with:

```tsx
    <div className="flex min-h-svh">
```

(drops the gap/padding that made the sidebar and header read as floating glass panels — they're now flush against the viewport edges, separated by hairline borders instead of a gap)

Replace the `<aside>` className (currently `"glass-sidebar hidden shrink-0 overflow-hidden rounded-3xl md:flex md:flex-col"`) with:

```tsx
        className={cn(
          "hidden shrink-0 overflow-hidden border-r border-border bg-muted/40 md:flex md:flex-col",
          collapsed ? "w-16" : "w-60",
        )}
```

Replace the `<header>` className (currently `"glass-overlay sticky top-0 z-10 flex h-14 shrink-0 items-center justify-between px-4 md:mb-3 md:rounded-2xl"`) with:

```tsx
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center justify-between border-b border-border bg-background px-4">
```

Replace the mobile nav `SheetContent` (currently `<SheetContent side="left" className="w-64 p-0">`) with an override that cancels the shared `Sheet` component's glass-overlay treatment at this one call site, since `sheet.tsx` itself is not being edited (marketing uses it directly):

```tsx
        <SheetContent side="left" className="w-64 border-r border-border bg-background p-0 ring-0 shadow-none backdrop-blur-none">
```

- [ ] **Step 4: Drop the condensed brand font from portal chrome**

Per the spec, `--font-brand` (Big Shoulders, the condensed display font) stays reserved for the marketing site only, reinforcing that the portal is its own tool. `grep -rln "font-brand" src/app/portal src/components/layout` confirms `app-shell.tsx` is its only portal consumer, in two places — the mobile header wordmark and the mobile sheet-nav title.

Replace:

```tsx
            className="font-brand flex items-center gap-1.5 text-sm font-bold text-muted-foreground md:hidden"
```

with:

```tsx
            className="flex items-center gap-1.5 text-sm font-bold text-muted-foreground md:hidden"
```

and replace:

```tsx
          <SheetTitle className="font-brand flex items-center gap-2 px-4 py-4 text-lg font-bold tracking-tight text-primary">
```

with:

```tsx
          <SheetTitle className="flex items-center gap-2 px-4 py-4 text-lg font-bold tracking-tight text-primary">
```

(only the leading `font-brand` token is dropped in each; the rest of the wordmark styling — size, weight, tracking, the actual logo image — is unchanged. The full-size sidebar logo already renders via `<Image src="/logo-banner-*.svg">`, not text, so it's unaffected either way.)

- [ ] **Step 5: Verify**

Run `npm run dev`. On desktop width, confirm the sidebar shows 4 sections: Dashboard (standalone), Work (Projects/Tasks/Calendar), People (Clients/Directory/Attendance), Reference (Resources/Quick Links), then a divider and Admin (if logged in as an exec). Confirm the active page's nav link shows a left green bar instead of the old pill+ring. Collapse the sidebar (chevron button) and confirm icons still center correctly with no left-bar artifact. Resize to mobile width, open the hamburger menu, and confirm the mobile sheet nav renders flat (no blur/translucency) and its wordmark now renders in the default sans weight instead of the condensed brand font, while `(marketing)`'s own mobile nav (if it uses `Sheet`) is unaffected — spot check the marketing homepage on mobile width too. Replay the onboarding tour (via the sidebar's help icon) and confirm it still steps through all 9 non-admin destinations correctly (10 for execs).

- [ ] **Step 6: Commit**

```bash
git add src/components/layout/nav-links.ts src/components/layout/sidebar-nav.tsx src/components/layout/app-shell.tsx
git commit -m "Restructure sidebar into 4 named groups, flatten shell chrome

Adds a Reference group (Resources, Quick Links) so nothing sits
ungrouped/unexplained; replaces the pill+ring active nav state with
a left accent bar; flattens the sidebar/header from floating glass
panels to a flush bordered shell. Same 10 destinations, same depth.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UDgMsa1SX6qHqFhYPDHEpn"
```

---

### Task 6: Rebuild the dashboard

**Files:**
- Modify: `src/app/portal/(app)/page.tsx`

**Interfaces:**
- Consumes: `PageHeader` (Task 4), `SignalDot` + `TASK_PRIORITY_DOT_CLASS` (Task 3), `Tabs`/`TabsList`/`TabsTrigger`/`TabsContent` (Task 2 flattened these).
- Produces: no change to this page's exported default component's signature or route. All existing data-fetching (lines 41-216 of the current file) is untouched — only the JSX returned, and the `AttentionRow`/`StatTile` helper functions at the bottom, change. `StatTile` is deleted (dead code once stat tiles become inline figures); `AttentionRow` is kept as-is, now called from a new `Team` helper instead of inline in the default export.

- [ ] **Step 1: Replace the "no active quarter" early return's header**

Near the top of the file, in the `if (!activeQuarter)` branch, replace:

```tsx
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Welcome, {profile.name.split(" ")[0]}
          </h1>
          <p className="text-sm text-muted-foreground">{roleLabel(profile.role)}</p>
        </div>
```

with:

```tsx
        <PageHeader title={`Welcome, ${profile.name.split(" ")[0]}`} description={roleLabel(profile.role)} />
```

- [ ] **Step 2: Replace the main return statement**

The file has two `return (...)` statements: an early one inside the `if (!activeQuarter)` branch (touched in Step 1 only) and the main one after all the data-fetching (currently lines 217-441, starting `return ( <div className="space-y-6"> <div> <h1 className="text-2xl font-semibold tracking-tight"> Welcome, ...` and ending with the closing `);` followed immediately by the `}` that closes the `DashboardPage` function itself, right before the `AttentionRow`/`StatTile` helper functions). Replace that second, later `return` statement in full — including both its closing `);` and the `DashboardPage` function's closing `}` right after it — with the following (note this code block also ends with `);` then `}`, for the same reason):

```tsx
  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome, ${profile.name.split(" ")[0]}`}
        description={`${roleLabel(profile.role)} · ${activeQuarter.name}`}
      />

      {exec && summary ? (
        <Tabs defaultValue="mine">
          <TabsList>
            <TabsTrigger value="mine">My work</TabsTrigger>
            <TabsTrigger value="team">Team</TabsTrigger>
          </TabsList>
          <TabsContent value="mine" className="pt-4">
            <MyWork
              nextRooms={nextRooms}
              nextMeetingDate={nextMeetingDate}
              pendingAttendanceNudges={pendingAttendanceNudges}
              attendanceSummary={attendanceSummary}
              threshold={threshold}
              myAllTasksCount={myAllTasks.length}
              doneTaskCount={doneTaskCount}
              myProjects={myProjects}
              roster={roster}
              taskGroups={taskGroups}
            />
          </TabsContent>
          <TabsContent value="team" className="pt-4">
            <Team
              summary={summary}
              execTodos={execTodos}
              execMembers={execMembers}
              today={today}
              nextMeetingDate={nextMeetingDate}
            />
          </TabsContent>
        </Tabs>
      ) : (
        <MyWork
          nextRooms={nextRooms}
          nextMeetingDate={nextMeetingDate}
          pendingAttendanceNudges={pendingAttendanceNudges}
          attendanceSummary={attendanceSummary}
          threshold={threshold}
          myAllTasksCount={myAllTasks.length}
          doneTaskCount={doneTaskCount}
          myProjects={myProjects}
          roster={roster}
          taskGroups={taskGroups}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Replace `AttentionRow`/`StatTile` with `MyWork`/`Team`/`AttentionRow`**

At the bottom of the file, delete the `StatTile` function entirely. Keep `AttentionRow` exactly as it is. Add two new functions above `AttentionRow`:

```tsx
function MyWork({
  nextRooms,
  nextMeetingDate,
  pendingAttendanceNudges,
  attendanceSummary,
  threshold,
  myAllTasksCount,
  doneTaskCount,
  myProjects,
  roster,
  taskGroups,
}: {
  nextRooms: { projectId: string; clientName: string; room: string; isToday: boolean }[];
  nextMeetingDate: string | null;
  pendingAttendanceNudges: { projectId: string; clientName: string }[];
  attendanceSummary: Awaited<ReturnType<typeof getMyAttendanceSummary>>;
  threshold: number;
  myAllTasksCount: number;
  doneTaskCount: number;
  myProjects: Awaited<ReturnType<typeof getMyProjects>>;
  roster: Map<string, Awaited<ReturnType<typeof getProjectMembers>>>;
  taskGroups: { label: string; tasks: TaskWithProject[] }[];
}) {
  return (
    <div className="space-y-6">
      {nextRooms.length > 0 && (
        <div className="space-y-2">
          {nextRooms.map((r) => (
            <Alert key={r.projectId} tone="primary">
              <MapPin />
              {r.clientName} meets in <span className="font-medium">{r.room}</span>{" "}
              {r.isToday
                ? "today."
                : `next time (${nextMeetingDate ? format(parseLocalDate(nextMeetingDate), "EEE, MMM d") : ""}).`}
            </Alert>
          ))}
        </div>
      )}

      {pendingAttendanceNudges.length > 0 && (
        <div className="space-y-2">
          {pendingAttendanceNudges.map((n) => (
            <Alert key={n.projectId} render={<Link href={`/portal/attendance?team=${n.projectId}`} />}>
              <AlertTriangle />
              {n.clientName} hasn&apos;t logged today&apos;s attendance yet -- it&apos;s a meeting
              day. Log it now.
            </Alert>
          ))}
        </div>
      )}

      {myProjects.length > 0 && (
        <div className="flex flex-wrap gap-6">
          <Link href="/portal/attendance" className="group">
            <p className="text-xs text-muted-foreground">Your attendance</p>
            <p
              className={cn(
                "text-2xl font-semibold tabular-nums group-hover:underline",
                attendanceSummary.rate !== null && attendanceSummary.rate < threshold && "text-warning",
              )}
            >
              {attendanceSummary.rate === null ? "--" : `${Math.round(attendanceSummary.rate * 100)}%`}
            </p>
          </Link>
          <Link href="/portal/tasks" className="group">
            <p className="text-xs text-muted-foreground">Tasks this quarter</p>
            <p className="text-2xl font-semibold tabular-nums group-hover:underline">
              {doneTaskCount}/{myAllTasksCount}
            </p>
          </Link>
        </div>
      )}

      {myProjects.length > 0 && (
        <div className="divide-y divide-border">
          {myProjects.map((project) => (
            <Link
              key={project.id}
              href={`/portal/projects/${project.id}`}
              className="flex flex-wrap items-center gap-3 py-3 transition-colors first:pt-0 hover:bg-muted/50"
            >
              <div className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{project.client_name}</span>
                <span className="text-xs text-muted-foreground">
                  PM: {project.project_manager?.name ?? "Unassigned"}
                  {project.senior_consultant && ` · SC: ${project.senior_consultant.name}`}
                </span>
              </div>
              <RosterAvatars members={roster.get(project.id) ?? []} />
              <div className="flex shrink-0 items-center gap-2">
                <HealthBadge health={project.health} />
                {project.deadline && (
                  <span className="text-xs text-muted-foreground">
                    Due {format(parseLocalDate(project.deadline), "MMM d")}
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">My tasks</CardTitle>
          <CardDescription>Open tasks assigned to you this quarter.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {myProjects.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              You&apos;re not on a team this quarter yet.
            </p>
          ) : taskGroups.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing on your plate right now.</p>
          ) : (
            taskGroups.map((group) => (
              <div key={group.label} className="space-y-1">
                {group.label === "Overdue" ? (
                  <SignalDot
                    dotClassName="bg-destructive"
                    label={group.label}
                    className="text-xs font-medium text-destructive"
                  />
                ) : (
                  <p className="text-xs font-medium text-muted-foreground">{group.label}</p>
                )}
                {group.tasks.map((task) => (
                  <div
                    key={task.id}
                    className="flex flex-wrap items-center justify-between gap-2 border-b py-2 last:border-b-0"
                  >
                    <div className="min-w-0">
                      <Link
                        href={`/portal/projects/${task.project_id}`}
                        className="block truncate text-sm font-medium hover:underline"
                      >
                        {task.task_name}
                      </Link>
                      <span className="text-xs text-muted-foreground">
                        {task.project?.client_name ?? "Unknown project"}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <SignalDot
                        dotClassName={TASK_PRIORITY_DOT_CLASS[task.priority]}
                        label={TASK_PRIORITY_LABELS[task.priority]}
                      />
                      <span className="text-xs text-muted-foreground">
                        {task.due_date ? format(parseLocalDate(task.due_date), "MMM d") : "No due date"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ))
          )}
          <div>
            <Link href="/portal/tasks" className="text-sm text-primary hover:underline">
              View all tasks
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Team({
  summary,
  execTodos,
  execMembers,
  today,
  nextMeetingDate,
}: {
  summary: {
    atRiskProjects: { id: string; clientName: string }[];
    belowThresholdMembers: { userId: string; name: string; rate: number }[];
    missingAttendanceTeams: { projectId: string; clientName: string }[];
    unbookedRoomTeams: { projectId: string; clientName: string }[];
  };
  execTodos: Awaited<ReturnType<typeof getExecTodos>>;
  execMembers: { id: string; name: string }[];
  today: string;
  nextMeetingDate: string | null;
}) {
  return (
    <div className="space-y-3">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Exec to-dos</CardTitle>
          <CardDescription>Shared admin checklist -- not tied to a project.</CardDescription>
        </CardHeader>
        <CardContent>
          <ExecTodoList todos={execTodos} execMembers={execMembers} today={today} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Needs attention</CardTitle>
          <CardDescription>Org-wide items worth a look right now.</CardDescription>
        </CardHeader>
        <CardContent>
          {summary.atRiskProjects.length === 0 &&
          summary.belowThresholdMembers.length === 0 &&
          summary.missingAttendanceTeams.length === 0 &&
          summary.unbookedRoomTeams.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing needs attention right now -- everything&apos;s on track.
            </p>
          ) : (
            <div>
              <AttentionRow
                icon={AlertTriangle}
                label={`${summary.atRiskProjects.length} project${summary.atRiskProjects.length === 1 ? "" : "s"} at risk`}
                items={summary.atRiskProjects.map((p) => ({
                  key: p.id,
                  label: p.clientName,
                  href: `/portal/projects/${p.id}`,
                }))}
              />
              <AttentionRow
                icon={AlertTriangle}
                label={`${summary.belowThresholdMembers.length} below attendance target`}
                items={summary.belowThresholdMembers.map((m) => ({
                  key: m.userId,
                  label: `${m.name} (${Math.round(m.rate * 100)}%)`,
                  href: "/portal/directory",
                }))}
              />
              <AttentionRow
                icon={AlertTriangle}
                label={`${summary.missingAttendanceTeams.length} haven't logged today's attendance`}
                items={summary.missingAttendanceTeams.map((t) => ({
                  key: t.projectId,
                  label: t.clientName,
                  href: `/portal/attendance?team=${t.projectId}`,
                }))}
              />
              <AttentionRow
                icon={MapPin}
                label={`${summary.unbookedRoomTeams.length} need a room for ${
                  nextMeetingDate ? format(parseLocalDate(nextMeetingDate), "EEE, MMM d") : "the next meeting"
                }`}
                items={summary.unbookedRoomTeams.map((t) => ({
                  key: t.projectId,
                  label: t.clientName,
                  href: "/portal/admin/rooms",
                }))}
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 4: Fix imports**

At the top of the file: add `import { PageHeader } from "@/components/layout/page-header";`, `import { SignalDot } from "@/components/signal-dot";`, and `import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";`. Add `TASK_PRIORITY_DOT_CLASS` to the existing `import { TASK_PRIORITY_LABELS } from "@/lib/project-labels";` line, making it `import { TASK_PRIORITY_DOT_CLASS, TASK_PRIORITY_LABELS } from "@/lib/project-labels";`. Remove the now-unused `import { Badge } from "@/components/ui/badge";` line (the priority `Badge` it rendered is replaced by `SignalDot` in Step 3).

- [ ] **Step 5: Verify**

Run `npm run dev`, open `/portal` as a non-exec: confirm the page header renders via `PageHeader`, stats render as plain inline figures (not boxed tiles), "My teams" is a hairline-divided list (not individually bordered cards), and task groups show sentence-case labels with a red dot only on "Overdue". Log in as an exec (or switch role in whatever the project's local dev auth allows) and confirm the "My work" / "Team" tabs appear, "My work" shows the exact same content as the non-exec view, and "Team" shows the Exec to-dos and Needs-attention cards. Confirm every alert/stat/list/card that existed before this task still exists somewhere in this page (cross-reference against the spec's Problem section — nothing should be missing). Check light/dark mode and mobile width.

- [ ] **Step 6: Commit**

```bash
git add "src/app/portal/(app)/page.tsx"
git commit -m "Rebuild the dashboard on PageHeader/SignalDot/Tabs

Splits the always-stacked exec content (exec to-dos, needs-attention)
into an opt-in Team tab so execs see their own work first like
everyone else; flattens stat tiles and the project list from boxed
cards to plain figures/hairline-divided rows; switches task-group
labels to sentence-case with a signal dot only on Overdue. Every
alert, stat, list, and card that existed before is still present.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UDgMsa1SX6qHqFhYPDHEpn"
```

---

### Task 7: Shared chrome pass

**Files:**
- Modify: `src/components/layout/command-palette.tsx:221`
- Modify: `src/components/layout/onboarding-tour.tsx:122`

**Interfaces:**
- Consumes: nothing new. `notification-bell.tsx` needs no direct change — it renders inside `PopoverContent`, which Task 2 already flattened.

- [ ] **Step 1: Command palette section labels**

In `src/components/layout/command-palette.tsx:221`, replace:

```tsx
                <p className="px-2.5 py-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                  {section.heading}
                </p>
```

with:

```tsx
                <p className="px-2.5 py-1 text-xs font-medium text-muted-foreground">
                  {section.heading}
                </p>
```

- [ ] **Step 2: Onboarding tour callout shadow**

In `src/components/layout/onboarding-tour.tsx:122`, replace:

```tsx
        className="fixed z-50 rounded-lg border bg-popover p-4 text-popover-foreground shadow-lg transition-all duration-200"
```

with:

```tsx
        className="fixed z-50 rounded-lg border bg-popover p-4 text-popover-foreground transition-all duration-200"
```

(drops the soft drop-shadow; the existing `border` already reads as a distinct surface against the flat background from Task 1)

- [ ] **Step 3: Verify**

Run `npm run dev`. Open the command palette (⌘K) and confirm its section headings ("Pages", "Quick links", "Clients", etc.) read in sentence case, not tracked uppercase. Trigger the onboarding tour replay (sidebar help icon) and confirm the callout bubble has a clean border with no drop shadow, in both light and dark mode. Open the notification bell and confirm it renders on the now-flat `PopoverContent` from Task 2 with no further changes needed.

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/command-palette.tsx src/components/layout/onboarding-tour.tsx
git commit -m "Sweep remaining chrome for uppercase labels and shadow

Command palette section headings switch to sentence case, and the
onboarding tour callout drops its soft drop-shadow, closing out the
last leftover glass/AI-dashboard tells in the shared chrome.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UDgMsa1SX6qHqFhYPDHEpn"
```

---

## What this plan does not cover

Per the spec's rollout plan, this plan covers phases 1 (Foundation), 2 (Dashboard), and part of the shared-chrome sweep. It deliberately does not touch the remaining ~14 pages (Projects, Tasks, Calendar, Clients, Directory, Attendance, Resources, Quick Links, the 6 Admin sub-pages, the two detail pages) beyond what cascades for free from Tasks 2 and 3 (every `Card`/`Dialog`/`Popover`/`Select`/`Tabs`/`HealthBadge` consumer on those pages already renders flat/dotted once this plan lands). A follow-up plan will cover the remaining structural work on those pages (page-header adoption, the few pages using uppercase tracked labels or ad-hoc card-row markup instead of the established patterns, and the two detail-page two-column layouts) — that follow-up plan requires reading each of those ~14 files in full to write it without placeholders, which this plan's scope did not include.
