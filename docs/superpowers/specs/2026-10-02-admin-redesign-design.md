# Admin Redesign: Hub, Breadcrumb Nav, Members Declutter

Date: 2026-10-02
Status: Draft, awaiting review

> **Update (2026-10-02):** the Rooms admin page and all room-assignment features (admin map, dashboard/attendance banners, notifications) were removed on this branch before merge. Wherever this spec mentions Rooms, read it as gone; Quarter setup is now Quarters and Meeting Days. The `room_bookings` and `room_hotspots` tables are intentionally left in the database.

## Problem

The exec-only Admin area has 10 pages (including Team Page, added with the profile editor) and feels cluttered and confusing to navigate:

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
- No merging of pages; the 10 pages and their internals (Team Builder, Team Page, Coffee Chats, Quarters, Rooms, Meeting Days, Stats, Settings, Activity) are unchanged apart from the navigation chrome.
- No data-model or schema changes.
- No attendance column on the Members table (Consultant Stats already shows it).

## Design

### 1. Routes and navigation

- `/portal/admin` becomes the new hub. Members moves to `/portal/admin/members`.
- The hub takes over the old `/portal/admin` URL, so existing bookmarks land on the hub, which links to Members. No redirect is needed.
- `ADMIN_NAV_LINKS` (`src/components/layout/nav-links.ts`) keeps its structure and `group` field. The Members entry's `href` changes to `/portal/admin/members`. The command palette consumes this list unchanged.
- `admin-nav.tsx` (four pill-tab groups) is replaced by an `AdminBreadcrumb` component: `Admin › <Area> › <Page>` plus sibling tabs for the other pages in the same area. Area label and siblings are derived from the `group` field. The area label map moves to one shared place so the hub and breadcrumb agree.
- The People area now has four pages: Members, Team Builder, Consultant Stats, Team Page. The Team Page tab keeps its pending-submission count badge (today rendered by `AdminNav` from `pendingTeamCount`, fetched in `admin/layout.tsx` via `getPendingTeamSubmissionCount`). The layout keeps fetching the count and passes it to `AdminBreadcrumb`; the hub's People card shows the same badge next to its Team Page link.
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
| N team-page submissions pending review | `getPendingTeamSubmissionCount` | Team Page |

The computation lives in one function (`getAdminAttentionItems`) returning typed items, so it can be unit tested without rendering.

**Quick actions.** Four tiles: Add members, Reset a password, Add meeting day, Add coffee-chat slots. Add members goes to `/portal/admin/members?action=bulk-add` and opens the bulk-add dialog. Reset a password goes to `/portal/admin/members?action=find` and focuses the search field. Add meeting day links to Meeting Days; Add coffee-chat slots links to Coffee Chats with the Schedule tab open (`?tab=schedule`). Unknown `?action=` values are ignored.

**Browse by area.** Four cards (People, Quarter setup, Recruitment, System), each listing its pages as direct links, generated from `ADMIN_NAV_LINKS`.

### 3. Members page (`/portal/admin/members`)

- Header action: "Bulk add" (opens a dialog containing the existing textarea, preview table and create flow). There is no single-member add today, so no "+ Add member" button in v1.
- Active / Archived tabs. The archived restore and permanent-delete table moves into the Archived tab; counts shown on the tabs.
- Role filter becomes chips (All, Consultants, PMs, Execs) next to the search box, replacing the role-filter dropdown.
- Role is displayed as text. The role-change action joins the existing per-row ⋯ menu (which already holds Edit email, Reset password and Archive). Permanent delete stays on archived rows, last in the menu and styled destructive. Existing confirmation dialogs, including `EditEmailDialog`, are kept as is.
- `members-panel.tsx` (about 815 lines after the profile editor's Edit email addition) is split along these seams: bulk-add dialog, active members table, archived members table, row actions menu, edit-email dialog. Behavior and server actions are unchanged.

### 4. Global quarter picker

- One quarter picker, using the existing `QuarterSelect` component and a `?quarter=` param. It appears in the hub header and on the breadcrumb bar of quarter-scoped pages (Consultant Stats, Team Builder, Meeting Days, Rooms).
- Those four pages currently each render their own picker. Team Builder, Meeting Days and Rooms pass `basePath="/admin/..."` (missing the `/portal` prefix, so changing quarter there goes to a nonexistent URL); removing the per-page pickers fixes this. They keep reading `?quarter=`; their per-page pickers are removed, and the breadcrumb and tab links carry the `?quarter=` param so the selection persists across them.
- Pages that are not quarter-scoped (Members, Rooms, Settings, Activity, Coffee Chats) do not show the picker on the breadcrumb bar.

## Components and files

- New: `admin/page.tsx` (hub), `admin/members/page.tsx`, `AdminBreadcrumb`, `getAdminAttentionItems`, hub tile components.
- Changed: `admin/layout.tsx` (keeps the pending team-page count fetch), `nav-links.ts` (Members href), Members panel split into focused files, quarter-scoped admin pages (picker removal).
- Removed: `admin/admin-nav.tsx`.

## Error handling

- Each needs-attention source (attendance, draft, coffee-chat slots, team-page submissions) is fetched independently; if one fails, the others still render and the failed one is omitted rather than breaking the hub.
- Unknown `?action=` values are ignored.

## Testing

- Unit tests for `getAdminAttentionItems`: each of the four conditions on and off, all-clear, and one source failing.
- Manual walkthrough: hub renders for an exec and redirects non-execs; every breadcrumb and tab link; `/portal/admin` bookmark behavior; each quick action opens the right dialog; the Team Page pending badge appears on the breadcrumb tab and hub card; Members flows (bulk add, add, role change, reset password, archive, restore, delete); quarter selection persists across Stats, Team Builder and Meeting Days; mobile width.
- Run lint and the production build.

## Risks and open questions

- **URL change:** Members moves from `/portal/admin` to `/portal/admin/members`. Any external links to the old URL land on the hub.
- **Attention thresholds:** "this week" for unbooked slots and the exact draft-status check depend on fields in `coffee-chat.ts` and `team-builder.ts`; the plan must confirm them before building.
