# Team page profiles — design

Date: 2026-10-02

## Goal

Execs (and members themselves) manage the public `/team` page from the portal
instead of editing hardcoded arrays in `src/app/(marketing)/team/page.tsx`.
Name, title and section come from the portal roster automatically; members
supply their own photo, bio, LinkedIn and major; an exec approves additions and
changes in a one-screen queue.

## Decisions (agreed with the user)

- The team page is a **public view of the portal roster**, not a separate list.
- Name, title and section are **never stored** for the team page. They are read
  from `profiles` at render time, so role changes and archiving flow through.
- Members edit their own profile fields; **member edits require exec approval**.
  Exec edits (including an exec editing their own profile) apply immediately.
- Visibility is **opt-in** (`listed`, default false). A member is listed once an
  exec approves their first submission. Hiding or self-removal is **instant**.
- Photo upload has a **fixed 4:5 crop/zoom** step and **accepts HEIC**.
- Bio is capped at **120 characters** (it renders in the hover overlay).

## Data model

New table `public.team_profiles`, one row per member (created lazily on first
save), `profile_id uuid primary key references profiles(id) on delete cascade`.

Live (public) fields:
- `bio text` (<= 120 chars), `linkedin_url text`, `major text`
- `photo_path text` (object path in the `team-photos` bucket)
- `listed boolean not null default false`

Pending fields (never read by the public page):
- `pending_bio`, `pending_linkedin_url`, `pending_major`, `pending_photo_path`
- `pending_submitted_at timestamptz` (non-null = has a pending submission)

One pending slot per member: a new member edit replaces the previous pending
submission. Constraints: bio length check, `linkedin_url` must match
`https://(www.)?linkedin.com/...`.

`profiles.linkedin_url` (used by alumni) is left alone. The member form
pre-fills from it when `team_profiles` has no value yet.

Access: RLS enabled; `select` for the row owner and execs; **no write policies
for `authenticated`**. All writes go through server actions that verify the
caller (own row, or exec) and then use the service-role admin client. This
avoids column-level RLS for the "members may only touch pending_*" rule.

## Storage

Public bucket `team-photos`: JPEG only, 1 MB max object size. Objects are named
`{profile_id}/{uuid}.jpg`. Storage policy: authenticated users may insert only
under their own `{auth.uid()}/` prefix. Deletes happen server-side only.

The client uploads directly (session-scoped, under the policy above), then calls
a server action with the path; the action checks the path starts with the
caller's id (or, for exec edits on someone else's row, that member's id) before
saving it as `pending_photo_path` / `photo_path`.

Orphan cleanup (server-side, best-effort): replacing a pending photo deletes the
previous pending object; reject deletes the pending object; approve deletes the
superseded live object.

A pending photo is publicly reachable by URL in principle, but the name is an
unguessable uuid and nothing links to it. Accepted for simplicity.

`next.config.ts` currently has no `images` config; add `images.remotePatterns`
for the Supabase project host with pathname `/storage/v1/object/public/team-photos/**`
(per Next 16 `remotePatterns` docs) so `next/image` can render the photos.

## Photo pipeline (client)

1. Member picks a file (jpg/png/webp/heic, input cap ~15 MB).
2. HEIC/HEIF is converted to JPEG in the browser with a lazily-imported library
   (`heic-to` or `heic2any`, chosen and verified against a real HEIC file during
   implementation). Conversion failure shows "Couldn't read this photo, try
   exporting it as a JPG."
3. `react-easy-crop` crop dialog: drag + zoom (slider / pinch) inside a fixed 4:5
   frame.
4. The crop is rendered to a ~800x1000 JPEG via canvas (quality ~0.85) and
   uploaded. Output is a few hundred KB.

## Approval flow

- `saveMyTeamProfile(input)` (member): writes `pending_*`, sets
  `pending_submitted_at`. Photo, LinkedIn and major are **required** (a
  submission can't be saved without them, counting values already live); bio is
  optional.
- `saveTeamProfileAsExec(profileId, input)` (exec): writes live fields directly,
  clears any pending slot for that member (same required fields as members).
  `listed` is set to true only when this creates the member's row; on an existing
  row it is left unchanged, so editing a hidden member does not relist them
  (use the Show toggle).
- `approveSubmission(profileId)` (exec): copies `pending_*` to live, clears
  pending, sets `listed = true`, deletes the superseded photo object.
- `rejectSubmission(profileId)` (exec): clears pending, deletes the pending
  photo object. No rejection note (out of scope).
- `approveAll()` (exec): approves every pending submission.
- `setListed(profileId, listed)` (exec) and `removeMyListing()` (member):
  flip `listed` to false; immediate.
- Approve/reject/hide write an audit-log entry via `logAudit`.

## Public page (`/team`)

- Server component reads `team_profiles` joined to `profiles` through the admin
  client, selecting only: name, role, bio, linkedin_url, major, photo_path.
  Filter: `listed = true` and `profiles.archived_at is null`.
- Sections by role: exec roles -> Executive Board; `project_manager` -> Project
  Managers; `senior_consultant`, `consultant`, `junior_consultant` ->
  Consultants. Exec board in fixed order (president, projects, internal,
  external, training, marketing); other sections alphabetical.
- Subtitle: role label for exec board; major for PMs and consultants (major is
  required, so no fallback is needed for listed members).
- `/team` is already dynamic (the marketing layout reads cookies), so no
  revalidation wiring is needed.
- Card design is unchanged. The hover overlay gains the bio above the LinkedIn
  button. On touch devices the overlay opens on tap; it also opens on keyboard
  focus. Missing photo falls back to `PhotoPlaceholder`.
- The hardcoded `EXEC_BOARD`, `PROJECT_MANAGERS`, `CONSULTANTS` arrays and their
  TODOs are removed. Empty sections keep the "coming soon" line.

## Portal UI

- **Member:** `/portal/profile` ("My public profile", added to `NAV_LINKS`):
  photo + crop (required), LinkedIn (required), major (required), bio
  (optional) with live 120-char counter, status
  ("Not listed" / "Pending review" / "Live"), and a "Remove me from the team
  page" button.
- **Exec:** `/portal/admin/team-page` (added to `ADMIN_NAV_LINKS`, count badge of
  pending submissions):
  - *Pending*: one card per submission, current vs. proposed side by side,
    Approve / Reject, plus "Approve all".
  - *Roster*: all members with status, Hide/Show toggle, and Edit (opens the same
    form, saved live).

## Edge cases

- Member with no `team_profiles` row: row created on first save.
- Role change while a submission is pending: no effect; section is computed at
  render.
- Member archived: drops off the page automatically; row retained, so restoring
  the member restores their listing.
- Member edits while already live: live content stays until the exec approves;
  the page keeps showing the old content meanwhile.
- Multiple execs acting at once: approve/reject are idempotent on
  `pending_submitted_at is not null`.
- Seeding: the six current execs each submit their profile once (their own
  edits apply immediately because they are execs).

## Testing

Vitest unit tests for pure logic extracted into `src/lib/team-page.ts`: section
and ordering grouping, bio/LinkedIn validation, approve/reject state transitions
on a plain row object. Manual verification: HEIC conversion with a real file,
crop output dimensions, member -> pending -> approve -> public page, hide, and
archived-member exclusion. Before coding, read the relevant Next 16 docs in
`node_modules/next/dist/docs/` (per AGENTS.md).

## Out of scope

Rejection notes, email or bell notifications for pending submissions (badge
only), drag-to-reorder, rich-text bios, free-form (non-4:5) cropping, showing
alumni on the team page.
