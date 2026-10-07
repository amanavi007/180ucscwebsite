# Recruitment Points — Piece 2: Bulk Entry and Booking Links

Date: 2026-10-07
Status: Draft for review. Builds on `2026-10-07-recruitment-points-foundation-design.md` (piece 1, merged).

## Goal

Make giving points fast. An exec pastes or uploads a Zoom attendee report (or types a list of names from an
in-person info session), reviews anything uncertain, and everyone gets their points in one step. Separately,
coffee chat and interview bookings already hold the applicant's name and email, so marking them
attended / no-show / excused should create the points (and the applicant) automatically.

## Decisions carried in

- Applicants are created on the fly; names are the main match key (people join Zoom with school accounts).
- Review step uses the approved **grouped "what needs you"** layout (matched collapsed, uncertain rows
  expanded with one action each, new people listed). Not a flat table.
- Nothing is auto-accepted without a human glance at the summary; exact normalized matches are the only
  ones pre-approved, and they are shown (collapsed) before confirming.
- A coffee chat is one per applicant, so no per-category cap.
- **Interviews give no attendance points.** Attending or missing an interview is a status only; it controls
  who appears in interview scoring (piece 3). Cancelling through the booking link is *excused*.
- Coffee chat: attended +1, no-show −1 (requires a reason, auto-filled "No-show, no notice"), excused 0.
  Cancelling through the booking link is excused and creates no points row.

## A. Bulk import from an attendee list

### Input
Paste names (one per line) or upload a `.csv`. Zoom participant reports are recognised by their header
(`Name (original name)`, `User Email`, `Join time`, `Leave time`, `Duration (minutes)`). A plain name list
is also accepted (`Name` or `Name, email` per line). Parsing is a pure function:
`parseAttendeeInput(text: string): ParsedAttendee[]` where
`ParsedAttendee = { rawName: string; email: string | null; minutes: number | null }`.
Rows for the same person (same normalized name, or same email) are merged and their minutes summed — Zoom
logs a row per reconnect.

### Options before review
- **Event**: pick an existing event or create one inline (category, name, date). Points default to the
  category's default and are editable for this import.
- **Minimum time** (Zoom lists only): ignore attendees under N minutes (default 10, editable per import).

### Review (pure function `reviewImport`)
Each parsed attendee is classified, using `findMatches` from piece 1 plus aliases:

| Group | Meaning | Default action |
|---|---|---|
| **Matched** | exact normalized name/alias or email match to one applicant | will get points |
| **Needs a look** | fuzzy match(es), or several candidates | exec confirms a candidate, picks another, or skips |
| **New people** | no plausible match | will be created as applicants and get points |
| **Ignored** | on the quarter's ignore list, or looks like an existing portal member/exec (host, co-hosts) | skipped |
| **Already has points** | applicant already holds live points for this event | skipped (makes re-importing a second report safe) |

Every row has one clear action; "Skip" is always available. Confirming a fuzzy match or assigning a name to
an applicant saves an **alias** so the same display name matches automatically next time. "Ignore this name"
adds it to the ignore list (e.g. "Zoom Room 1", a host's laptop name).

### Commit (atomic)
A SQL function `commit_recruit_import(p_quarter, p_event, p_category, p_points, p_rows jsonb)` runs in one
transaction: creates the new applicants (`created_by_batch_id` = the batch), inserts one `recruit_points`
row per approved attendee (`source = 'import'`, shared `batch_id`), saves new aliases and ignored names.
It returns counts. The UI shows "38 people got +1 for Info Session 1" with an **Undo this import** button.

### Undo import
`undo_recruit_import(p_batch)` voids every live points row in the batch (reason "Import undone") and
archives applicants that this batch created if they have no other live points and no edits. Idempotent.

## B. Booking links (coffee chats and interviews)

### Data
`recruit_booking_links`: `id`, `booking_kind` (`coffee_chat` | `interview`), `booking_id uuid`,
`applicant_id`, `status` (`attended` | `no_show` | `excused`), `points_id uuid null`, `marked_by`,
`marked_at`; unique `(booking_kind, booking_id)`. `booking_id` is deliberately not a foreign key (two
different tables). Bookings are not quarter-scoped, so the **Attendance** queue shows bookings whose slot
date falls inside the selected quarter's `start_date`–`end_date`.

`recruit_categories` gains `system_key text unique null`; the four seeded categories get
`coffee_chat_attended`, `coffee_chat_no_show`, `coffee_chat_excused`, and `info_session`. They can be renamed
and their points changed (the key is how marking finds them), but not archived.

### Attendance tab (new tab on the Applicants page)
A queue of past, still-unmarked bookings, grouped by slot date, with a segmented **Attended / No-show /
Excused** control per booking and **Mark everyone attended** per slot. Cancelled bookings appear as
informational "Cancelled — excused" rows with no action. A banner on the Applicants page ("3 coffee chats to
mark") links here.
- Marking resolves the applicant: exact email match in the quarter → that applicant; else a name review (same
  matcher; exec confirms or creates new); else a new applicant is created from the booking's name and email.
- Coffee chat marking calls `mark_recruit_booking(...)`: creates the link and, per status, the points row
  using the `system_key` category (no-show gets a default reason). Interview marking creates the link only.
- **Re-marking** voids the previous points row (reason "Attendance changed") and writes a new one, so the
  ledger stays append-only. **Clear mark** voids the row and deletes the link.
- No-show shows a one-line confirmation: "Gives −1 and can be voided later."

## Errors and edge cases
- Zoom CSV with BOM, CRLF, quoted commas, extra blank lines: parser tolerates.
- Empty / unreadable input: inline "Couldn't find any names" message, nothing is changed.
- Two attendees match the same applicant: second becomes "Needs a look" (possible duplicate in the list).
- An applicant merged away between review and commit: commit re-checks and reports skipped rows.
- Unique link per booking makes double-marking impossible even with two execs at once.

## Testing
Unit: `parseAttendeeInput` (Zoom format variants, merging reconnects, BOM/CRLF, plain lists), `reviewImport`
(each group, member/ignore detection, already-awarded skip, two-attendees-one-applicant), attendance status →
category/points mapping. Manual: full import with a real Zoom export, undo, re-import, mark a coffee chat each
way, re-mark, clear.

## Out of scope
Scoring (piece 3), composite ranking (piece 4), emailing applicants.
