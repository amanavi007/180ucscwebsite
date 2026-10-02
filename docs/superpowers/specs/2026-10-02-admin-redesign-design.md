# Admin Redesign: Hub, Breadcrumb Nav, Members Declutter

Date: 2026-10-02
Status: Draft, awaiting review

## Problem

The exec-only Admin area has 9 pages and feels cluttered and confusing to navigate:

- Three stacked navigation layers: the main sidebar, Admin's four labeled pill-tab groups (People, Quarter setup, Recruitment, System), and in-page tabs (Coffee Chats).
- `/portal/admin` lands directly on Members, which shows bulk-add, the member table and the archived-members table all at once. Every row carries a role dropdown plus reset-password and archive actions.
- Nothing tells an exec what needs attention. They have to visit pages to find out.

## Goals

- An exec can reach any admin page in one click from a single, uncluttered entry point.
- Common jobs (add members, reset a password, add a meeting day, add coffee-chat slots) are one click from the entry point.
- Problems that need action are surfaced without visiting each page.
- Members page shows one thing at a time and makes destructive actions hard to hit by accident.

## Non-goals

- No quarter-phase tracker (decided: skip; the app has no notion of a current phase).
- No merging of pages; the 9 pages and their internals (Team Builder, Coffee Chats, Quarters, Rooms, Meeting Days, Stats, Settings, Activity) are unchanged apart from the navigation chrome.
- No data-model or schema changes.
- No attendance column on the Members table (Consultant Stats already shows it).

## Design

### 1. Routes and navigation

- `/portal/admin` becomes the new hub. Members moves to `/portal/admin/members`.
- A redirect/compat step keeps old `/portal/admin` bookmarks useful: they land on the hub, which links to Members.
- `ADMIN_NAV_LINKS` (`src/components/layout/nav-links.ts`) keeps its structure and `group` field. The Members entry's `href` changes to `/portal/admin/members`. The command palette consumes this list unchanged.
- `admin-nav.tsx` (four pill-tab groups) is replaced by an `AdminBreadcrumb` component: `Admin › <Area> › <Page>` plus sibling tabs for the other pages in the same area. Area label and siblings are derived from the `group` field. The area label map moves to one shared place so the hub and breadcrumb agree.
- Single-page areas (Recruitment) show the breadcrumb with no sibling tabs.
- `admin/layout.tsx` keeps the exec gate (`isExec`) and drops the static "Admin" title block. The hub renders its own header; inner pages render the breadcrumb.

### 2. Admin hub (`/portal/admin`)

Header: title, a visible "Jump to or search" field that opens the existing command palette (the ⌘K shortcut already exists), and a single global quarter picker.

**Needs attention.** Computed server-side from existing data functions. A row appears only when its condition holds; with no rows it shows "All clear". Each row has a button that deep-links to the item.

| Signal | Source | Link target |
|---|---|---|
| N consultants below attendance threshold | `getConsultantStatsRollup` + `getAttendanceAlertThreshold` | Consultant Stats |
| Team draft exists and is not finalized | `team-builder.ts` | Team Builder |
| Open coffee-chat slots this week with no bookings | `getAllSlots` + `getAllBookings` | Coffee Chats |

The computation lives in one function (`getAdminAttentionItems`) returning typed items, so it can be unit tested without rendering.

**Quick actions.** Four tiles: Add members, Reset a password, Add meeting day, Add coffee-chat slots. Each deep-links to its page with `?action=<name>`; the target page reads the param on mount to open the relevant dialog or focus the relevant field. Reset a password goes to Members with the search field focused.

**Browse by area.** Four cards (People, Quarter setup, Recruitment, System), each listing its pages as direct links, generated from `ADMIN_NAV_LINKS`.

### 3. Members page (`/portal/admin/members`)

- Header actions: "Bulk add" (opens a dialog containing the existing textarea, preview table and create flow) and "+ Add member".
- Active / Archived tabs. The archived restore and permanent-delete table moves into the Archived tab; counts shown on the tabs.
- Role filter becomes chips (All, Consultants, PMs, Execs) next to the search box, replacing the role-filter dropdown.
- Role is displayed as text. The role change, reset password, archive and permanent delete actions move into a per-row ⋯ menu. Existing confirmation dialogs are kept as is; permanent delete is last and styled destructive.
- `members-panel.tsx` (733 lines) is split along these seams: bulk-add dialog, active members table, archived members table, row actions menu. Behavior and server actions are unchanged.

### 4. Global quarter picker

- One quarter picker, using the existing `QuarterSelect` component and a `?quarter=` param. It appears in the hub header and on the breadcrumb bar of quarter-scoped pages (Consultant Stats, Team Builder, Meeting Days).
- Those three pages currently each render their own picker. They keep reading `?quarter=`; their per-page pickers are removed, and the breadcrumb and tab links carry the `?quarter=` param so the selection persists across them.
- Pages that are not quarter-scoped (Members, Rooms, Settings, Activity, Coffee Chats) do not show the picker on the breadcrumb bar.

## Components and files

- New: `admin/page.tsx` (hub), `admin/members/page.tsx`, `AdminBreadcrumb`, `getAdminAttentionItems`, hub tile components.
- Changed: `admin/layout.tsx`, `nav-links.ts` (Members href), Members panel split into focused files, quarter-scoped admin pages (picker removal).
- Removed: `admin/admin-nav.tsx`.

## Error handling

- Each needs-attention source is fetched independently; if one fails, the others still render and the failed one is omitted rather than breaking the hub.
- Unknown `?action=` values are ignored.

## Testing

- Unit tests for `getAdminAttentionItems`: each condition on and off, all-clear, and one source failing.
- Manual walkthrough: hub renders for an exec and redirects non-execs; every breadcrumb and tab link; `/portal/admin` bookmark behavior; each quick action opens the right dialog; Members flows (bulk add, add, role change, reset password, archive, restore, delete); quarter selection persists across Stats, Team Builder and Meeting Days; mobile width.
- Run lint and the production build.

## Risks and open questions

- **URL change:** Members moves from `/portal/admin` to `/portal/admin/members`. Any external links to the old URL land on the hub.
- **Single-add dialog:** "+ Add member" assumes a single-member add flow. Today only bulk add exists, so v1 either reuses the bulk dialog with one row, or the button is omitted. Decision for the implementation plan.
- **Attention thresholds:** "this week" for unbooked slots and the exact draft-status check depend on fields in `coffee-chat.ts` and `team-builder.ts`; the plan must confirm them before building.
