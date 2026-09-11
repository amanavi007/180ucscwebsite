# Internal Portal UX/Visual Redesign

**Date:** 2026-09-11
**Scope:** The internal resource portal (`src/app/portal/**`) and its shared chrome
(`src/components/layout/**`, `src/app/globals.css`). The public marketing site
(`src/app/(marketing)/**`) is explicitly out of scope — it's considered complete.

## Problem

The portal is feature-complete (10 top-level destinations, a 6-page admin
section, ~17 pages total) but its UX and visual language work against that
feature set:

1. **Navigation is unclear.** The sidebar already attempts grouping ("Work" /
   "People" labels exist in `nav-links.ts` / `sidebar-nav.tsx`) but every item
   renders flat and always-visible, and the group labels are small
   tracked-uppercase text that reads as decoration rather than real
   structure. Users can't build a mental map of where things live.
2. **The dashboard is visually overloaded.** `portal/(app)/page.tsx` stacks
   alerts, two stat tiles, a project list, a task-groups card, and (for
   execs) two more full-width cards, all as separate identically-boxed
   blocks down one long column.
3. **The look is generic.** Glass/blur panels (`.glass-panel`,
   `.glass-overlay`, `.glass-sidebar`), animated gradient ambient washes
   (`body::before`), soft drop-shadows, and uniform rounded SaaS-card
   treatment make it read as a templated AI-generated dashboard rather than
   180DC's own tool.

**Non-goal:** removing any existing feature. Every page, alert, stat, and
admin capability that exists today must still exist after this redesign —
only its presentation and organization change, and any such change must be
justifiable against the problems above.

## Design

### 1. Visual system

Replace the glass/blur/gradient-wash aesthetic with a flat, bordered,
white-and-green system that stays recognizably 180DC while dropping the
generic-AI-dashboard tells (backdrop blur, gradient washes, soft
drop-shadows, ALL-CAPS tracked labels, pill+ring active states).

**Signature device:** the portal's real content is full of status signals —
project health, attendance rate, task priority, at-risk flags — currently
rendered through several different badge/pill/alert styles. Unify these into
one consistent "signal" language: a colored dot + label, used identically
everywhere (sidebar active-state, health, priority, attendance, at-risk
flags). This is the one throughline shaped by this app's actual data model.

**Color tokens** (light mode; dark mode is the existing inverse mapping,
retuned the same way):

| Token | Hex | Use |
|---|---|---|
| `paper` | `#F5F6F2` | Base canvas — replaces `--background`. Cool, faint sage tint; not stark white, not a cream/terracotta "AI page." |
| `ink` | `#1B1F1C` | Text — replaces `--foreground`. Warm-tinted charcoal, not pure black. |
| `surface` | `#FFFFFF` | The only "card" treatment — solid white with a `#DEE1DB` hairline border (`--border`). No blur, no drop-shadow. |
| `moss` | `#3F6B2A` | The one accent — primary actions, links, active nav state, brand. Deepened from today's `--primary` (`#588a2c`) so it reads as ink, not neon. |
| `signal-amber` | `#B45309` (existing `--warning`, kept) | At-risk / needs-attention signal only. |
| `signal-red` | existing `--destructive`, kept | Overdue / blocked signal only. |

White and green stay the dominant identity throughout — amber/red are
reserved strictly for status signals, never general decoration.

**Constraint: breezy and modern, not austere.** Dropping glass/blur/shadow
is a move toward clarity, not toward a dense, heavy, enterprise-utilitarian
tool. Keep generous whitespace and line-height, keep the existing
interaction-feedback motion (hover states, panel/sheet open transitions,
tab switches) rather than stripping motion out entirely, and keep perceived
performance fast (no new blur/backdrop-filter cost, fewer stacked layers to
paint). "Flat and bordered" should still feel light and inviting to open
every day, not like switching to a spreadsheet.

**Structural change:** the sidebar stops being a separate dark "glass" panel
and becomes the same flat `paper` canvas as the content, with a hairline
border on its right edge and a slightly deeper background tint. This breaks
from the near-universal "dark rail + light content" SaaS template and
removes the separate `--sidebar-*` token set in favor of the base tokens.

**Typography:** one family only — keep Geist Sans (already loaded) for all
portal UI, including headings. Drop `--font-brand` (Big Shoulders,
condensed) from portal chrome entirely; it stays reserved for the marketing
site only, reinforcing that the portal is its own tool. Numeric values
(stats, rates, counts) use tabular figures and slightly heavier weight so
they read as data at a glance.

**Dropped:** `.glass-panel`, `.glass-overlay`, `.glass-sidebar` and their
associated shadow variables; the `body::before` / `.marketing-light::before`
ambient gradient washes (marketing site keeps its own, unaffected — this
only removes the portal's use of the shared `body::before`, which must be
scoped so the marketing site's wash still renders); ALL-CAPS tracked section
labels; the `bg-primary/15` + `ring-1` pill active-nav-state (replaced by a
left accent bar).

### 2. Navigation / IA

Restructure the sidebar into 4 named zones, each with ≤3 items, so the
mental model is simple. Nothing collapses or hides — this is a heavily-used,
one-stop-shop tool, so added interaction cost (extra clicks to reveal a
collapsed group) is not worth the vertical space saved.

```
Dashboard                    ← Home, standalone

Work
  Projects
  Tasks
  Calendar

People
  Clients
  Directory
  Attendance

Reference
  Resources
  Quick Links
──────────────
Admin                        ← execs only, unchanged (own tab bar of 6 sub-pages)
```

Changes from today:

- `GROUP_LABEL` in `sidebar-nav.tsx` renders sentence-case with a small
  color dot (from the signal system) instead of tracked uppercase.
- `nav-links.ts`'s `NavLink.group` union gains a `"reference"` value;
  Resources and Quick Links (currently ungrouped/floating) move into it.
  This is the one structural nav change — everything else is a relabel of
  existing `group` values.
- Active nav state changes from filled pill + ring to a left accent bar
  (2-3px solid `moss`), consistent with the flat/bordered visual system.
- The command palette (⌘K) is unchanged structurally — it remains the fast
  path for anyone who already knows where they're going.
- Same 10 destinations, same depth. Nothing removed, hidden, or nested
  deeper.

### 3. Dashboard redesign

`portal/(app)/page.tsx` keeps every existing data source and card of
content; only the block count and grouping change.

**Everyone:**
- Urgent alerts (room-booking / attendance nudges) render as one compact
  stacked list instead of individual heavy `Alert` boxes.
- The two stat tiles (`StatTile`) become plain inline figures rather than
  boxed/bordered cards.
- "My teams" (the `myProjects` list) becomes a plain hairline-divided list
  instead of individually bordered link-cards.
- "My tasks" keeps its Overdue / This week / Later grouping, but the group
  label switches from uppercase to sentence-case + colored dot (signal
  language), matching the sidebar group labels.

**Execs only:** the dashboard gains two tabs — **My Work** (everything
above) and **Team** (Exec to-dos + Needs attention, i.e. the
`summary`/`execTodos` block that is currently always rendered below the
personal content for execs). Splitting this into an opt-in tab means an exec
sees their own work first, same as everyone else, instead of always
scrolling past two more full-width org-wide cards. Non-execs never see a
tab — `summary` is already `null` for them in the current code, so this only
simplifies the exec view.

No alert, stat, list, or card is removed — each is re-homed under one of two
views (My Work / Team) and given a lighter visual treatment.

### 4. Shared pattern language (for the remaining ~14 pages)

A pattern, not a page-by-page spec, so the rest of the app comes out
consistent during implementation rather than each page getting a one-off
treatment:

- **Every page** gets one plain page header: title + one-line description +
  primary action button, left-aligned, no card wrapper (`portal/(app)/*`
  pages are inconsistent about this today).
- **Structure follows the data type, not one template:**
  - Tabular/browsable data (Clients, Directory, Admin → Members, Admin →
    Rooms) → real tables (the existing, currently-unused
    `components/ui/table.tsx`) with hairline row dividers, not card grids.
  - Status-driven work (Projects, Tasks) → keep card/board treatment, since
    status columns are a functional fit for that data, not decoration.
  - Single-record detail pages (`projects/[id]`, `clients/[id]`) → two-column
    layout: primary content + a narrow side rail for status/metadata,
    echoing the dashboard's My Work / signal-rail split.
- `HealthBadge` and any other status-pill component (task priority,
  attendance-rate indicators, at-risk flags) are re-skinned onto the shared
  signal-dot language so status reads identically everywhere.
- Flat surfaces, hairline borders, no shadow/blur anywhere — same rule as
  the shell.

During implementation, each page is mapped onto whichever structure above
fits its data; any page where none fits cleanly gets flagged rather than
forced.

### 5. Shared chrome pass

`command-palette.tsx`, `notification-bell.tsx`, the mobile `Sheet` nav, and
`onboarding-tour.tsx` currently reference the glass tokens (`glass-overlay`,
etc.) and must be restyled onto the new flat surface system as part of the
foundation phase — otherwise they'll visually clash with the rest of the
redesigned shell.

## Rollout plan

Given the scope (shell + ~14 pages) and the goal of shipping before the new
quarter starts:

1. **Foundation** — visual tokens (`globals.css`), `app-shell.tsx` /
   `sidebar-nav.tsx` / `nav-links.ts` restructuring, shared page-header and
   signal-dot components. Everything else depends on this.
2. **Flagship page** — the dashboard (`portal/(app)/page.tsx`), since it's
   the worst offender and validates the new patterns end-to-end before
   they're stamped across every other page.
3. **Remaining pages** — apply the pattern language (§4) page-by-page. This
   is the largest bucket of work and the most parallelizable, since pages
   are largely independent of each other once the foundation and dashboard
   land.
4. **Shared chrome pass** (§5) — command palette, notification bell, mobile
   sheet nav, onboarding tour.

Phase 3's independence across pages means it is a good candidate for
parallel execution across multiple agents once phases 1-2 land, to fit the
end-of-week timeline.

## Testing

No data model, business logic, or route changes — this is presentation and
information-architecture only. Verification is:

- Manual pass through every portal page (both roles: exec and non-exec) in
  light and dark mode, at desktop and mobile widths, confirming every
  existing feature/data point identified in the audit above is still present
  and reachable.
- Keyboard focus visibility and `prefers-reduced-motion` respected (no new
  motion is introduced beyond what exists; nothing here should regress it).
- No existing automated test suite covers UI rendering today, so no
  automated tests are expected to fail or need updating; if any exist for
  the touched files they must still pass.
