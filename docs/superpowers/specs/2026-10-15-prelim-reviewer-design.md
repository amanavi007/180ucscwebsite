# Prelim reviewer (AI check of research docs and slides)

## Goal

A consultant picks their preliminary research doc or slide deck from Google Drive and gets a specific, criterion-by-criterion review, so the prelim is strong enough to pass the prelim checks. No downloading or uploading. The review is advisory, not a gate.

Success: a consultant can run a review in under a minute, see exactly what to fix (with a quote or slide number), fix it, and re-run to see progress. Execs can change the rules without a deploy.

## Decisions made

- Drive access: Google Picker with OAuth, scope `drive.file` only.
- Rubric: exec-editable in the portal (Setup), versioned.
- Placement: a "Prelim review" view inside each project (`/portal/projects/[id]?tab=review`).
- Approach: two-pass, rubric-driven review.

## Non-goals (v1)

Auto-fixing the file, writing comments back into the Doc, notifying PMs, a standalone reviewer page, per-slide agent loops.

## Flow

1. Consultant opens a project, switches to the Review view, and clicks **Review a file** (the one lime button on the view).
2. If not connected, Google sign-in (OAuth, `drive.file`). The Picker opens; they choose a Google Doc, Google Slides, or PDF.
3. The browser sends the file id and the short-lived access token to a server action. The token is used for that request only and is never stored.
4. **Pass 1 (deterministic, no model).** Export the file (Doc: plain text plus PDF; Slides: PDF plus per-slide text; PDF: as is). Extract URLs, citation-like patterns, headings, word count, and slide count. Per slide: whether any source-looking line or URL exists. These facts are passed to pass 2 as evidence, and some criteria can be decided here directly.
5. **Pass 2 (model).** The model gets the rubric for that file kind, the pass-1 facts, the text, and for slides the PDF so it can judge layout, fonts and background bubbles visually. It returns a structured result validated with zod: one entry per criterion with `status` (`pass`, `fix`, `missing`), an `evidence` quote or slide number, and a `suggestion`. It also returns an overall verdict (`ready` or `needs_work`).
6. The result is stored as a new `prelim_reviews` row and shown in the side panel. **Review again** always creates a new row; old rows are never overwritten.

## Data

- `review_rubrics`: `id`, `kind` (`doc` | `slides`), `version`, `criteria` (jsonb array of `{id, title, description}`), `guide_text` (the formatting guide the model reads), `created_by`, `created_at`. Latest version per kind is current; edits insert a new version.
- `prelim_reviews`: `id`, `project_id`, `created_by`, `file_id`, `file_name`, `file_url`, `kind`, `rubric_version`, `status` (`running` | `done` | `error`), `verdict`, `result` (jsonb), `error_message`, `created_at`.
- RLS: project team members, PMs and execs can read reviews for their project; only the author inserts; rubrics are readable by all signed-in users and writable by execs only. Migration follows the existing naming in `supabase/migrations`.

## Components

- `src/lib/prelim-review/`: `rubric.ts` (types, zod schemas), `extract.ts` (pass 1), `review.ts` (pass 2, uses `buildModel` from `src/lib/assistant/provider.ts`, Gemini primary because it reads PDFs), `drive.ts` (export helpers), each with a Vitest file.
- `src/app/portal/(app)/projects/[id]/review/`: view with the list of past reviews and the side panel (400 to 420px, opens on row click, closes with its ✕).
- Admin Setup section "Prelim review rules": left list of sections, edit the doc and slides rubric and guide text; saving creates a new version.

## UI (per `docs/ui-rulebook.md`)

- Theme tokens only. One lime main button per page ("Review a file"). Everything else is secondary or quiet.
- Status as a word in a `Badge`: `Passes` (ok), `Needs work` (warn), `Missing` (bad); overall `Ready for prelim check` (ok) or `Needs work` (warn). Running shows an `info` chip.
- Two navigation levels: project, then `UrlTabs` (`?tab=review`). Detail is a panel, not a page. Setup uses the settings skeleton, never tabs.
- Loading state shaped like the page, an empty state ("No reviews yet. Pick a file to get one." plus the button), and an error state with plain words and what to do. `useConfirm` for any destructive action; toasts only for completed actions.
- Disabled buttons say why nearby. Icon-only buttons get `aria-label`.
- Run the section 10 checks of the rulebook before finishing.

## Errors and limits

- Unreadable file, wrong type, too large, Google access denied, no model configured, and provider 429/5xx each get a plain message; the row is saved as `error` so the attempt is visible.
- Per-user rate limit (for example 10 reviews per hour) to protect free-tier quotas.
- Files over a size cap are rejected before the model call.

## Setup the owner must do

Google Cloud project with the Drive API and Picker API enabled, an OAuth client (web) with the portal origins, and a browser API key. New env vars: `GOOGLE_OAUTH_CLIENT_ID`, `NEXT_PUBLIC_GOOGLE_PICKER_API_KEY`, `NEXT_PUBLIC_GOOGLE_APP_ID`. These go in `.env.local.example`. Exact steps will be given at implementation time.

## Testing

Vitest unit tests for rubric schemas, pass-1 extraction (citations, URLs, per-slide source detection), result-schema validation, and rate limiting. The model call is mocked. One optional live test, run on demand, following the `*.live.test.ts` convention.

## Open items

- The actual formatting guide and prelim-check criteria text must be supplied by execs to seed the first rubric versions; v1 ships with a clearly labeled starter rubric.
- Exact criterion list for "background bubbles" and source format depends on the guide.
