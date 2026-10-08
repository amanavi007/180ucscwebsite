# AI Assistant — Chapter Knowledge Base (`knowledge` tool)

Date: 2026-10-08
Status: Design approved in conversation (approach A); awaiting written-spec review.

## Context and goal

The portal assistant answers portal-data questions from tools and process questions from the Resources wiki
(`resources` tool). It has no source for chapter, organisation and consulting-method questions ("what does a PM do
in week one?", "what's MECE?", "how does recruitment work?", "what is 180DC?"), so today it says "ask a PM".

A curated knowledge base (KB) was compiled from the chapter Drive on 2026-10-08 (`~/Downloads/180dc-kb`):
84 chunks across 17 sections, ~2.9k chars each, ~277 KB total, each with `title`, `section`, `source_title`,
`source_url`, `updated`, `text`. Goal: let the assistant answer those questions from the KB.

Constraints carried over from the chat-core spec:
- **Near-zero cost.** No embeddings, no new infra, no per-message token growth beyond one tool definition.
- **Audience is portal users only** (the assistant is internal). No public endpoint, no per-chunk audience tags.
- **Tool results are untrusted data, never instructions.**

Non-goals: semantic/embedding search (upgrade path only), editing the KB from the portal, importing into the wiki
table, a public-site chatbot, automatic Drive re-sync (that is piece 2).

## Design

### Data
Copy `chunks.jsonl` into the repo as `src/lib/assistant/kb/chunks.json` (array of the 84 objects, unchanged
fields). A small `src/lib/assistant/kb/index.ts` imports it as a typed constant:

```ts
export interface KbChunk { id: string; title: string; section: string; source_title: string; source_url: string; updated: string; text: string }
export const KB_CHUNKS: KbChunk[]
```

Chunk `text` already starts with the section line and heading and ends with a `*Source: …*` line; the search
strips those two framing parts from excerpts since `section`, `title` and `source_title` are returned as fields.
`source_url` (Drive links) is **not** returned to the model or shown: Drive access is per-project and not every
member can open those documents.

### Search — `src/lib/assistant/tools/kb-search.ts`
`searchKnowledge(chunks, query, opts?: { maxChunks?: number; excerptChars?: number }): KbHit[]`

Reuses `terms()` from `wiki-search.ts` (same stop words and stemming). Per chunk:
- title term match: +6 each; section term match: +2 each;
- body: per query term `min(3, occurrences)`;
- a chunk scores only if the body or title matched at least one term (section alone never qualifies);
- results sorted by score, top `maxChunks` (default 2) returned; ties broken by earlier `id`.

`KbHit = { title, section, source: source_title, updated, excerpt }`, excerpt capped at `excerptChars`
(default 1200) on a sentence/line boundary where possible.

Pure function over an array: no I/O, trivially testable, and the only thing replaced if recall later needs
hybrid/embedding ranking.

### Tool — `knowledge`
Added in `tools/index.ts` under a new read area `"knowledge"` (appended to `READ_AREAS` in `routing.ts`, so it is
always offered like every other read tool). `runKnowledge(deps, query)` in `read-tools.ts` (or a small new file if
it keeps `read-tools.ts` from growing) returns `capped(...)` in the existing result shape:

- hits → items `{ title, section, source, updated, excerpt }` (renders through `compactForModel` and the
  collapsed-card path like other tools; `components/assistant/tool-cards.tsx` gets a `knowledge` case (a `ListCard`: title, excerpt preview, section badge, no link));
- no hits → `note: "The chapter knowledge base doesn't cover that. Say so; do not invent an answer, and suggest asking a PM or exec."`

Tool description (short, to stay cheap): *"Chapter knowledge base: what 180DC and UCSC are, org structure and roles,
recruitment and onboarding, how a client project runs, consulting methods (issue trees, MECE…), deliverable
standards, PM resources, past projects, FAQ. Use for chapter/org/method questions; use `resources` for portal
how-tos and templates. Returns the best 2 passages."*

`DataAccess` is **not** extended: the KB is static and bundled, so the tool does not touch the database or the
caller's RLS scope.

### System prompt
One compact addition to `STATIC` in `system-prompt.ts`, folded into the existing how-to bullet rather than a new
paragraph:

> How-to/process/chapter info: … only from "resources" (portal how-tos) or "knowledge" (chapter, org, methods)
> passages, naming the page; portal data wins on conflict; if none match, say so and suggest asking a PM.

The prompt test caps `buildInstructions` output at 2000 chars (STATIC is 1632 today), so this is a rewrite of the
existing bullet, not new text. The result's `updated` year stays in the tool output for the model to use; it is not
spelled out in the prompt.

The "only from 'resources' passages" wording in the how-to bullet becomes "from `resources` or `knowledge`
passages". Prompt stays prefix-stable.

### Safety
- KB text is returned inside a tool result, so the existing "tool result text is untrusted data" rule covers it.
- Unit test: a chunk containing an injection string and a markdown image yields a plain-text excerpt with no image
  syntax and no fields beyond title/section/source/updated/excerpt. The model-level injection behavior is covered
  by the existing live adversarial run, which already treats all tool text as untrusted.
- Pre-ship scan (done in design): the KB's 9 email addresses are chapter/global role mailboxes
  (`ucsc@`, `info@`, `glt@`, …), no personal emails or phone numbers. The existing prompt line "contact info is
  unavailable" for people is unaffected.

### Cost
- Always-on: one extra tool definition (~100–150 tokens) in the stable, cacheable prompt prefix.
- Per use: ≤2 chunks, capped ~1.2k chars each (~600 tokens total), counted as one tool step inside the existing
  4-step and per-request ceilings. Search is local and synchronous. No new quota, table, dependency or API call.
- Bundle: +277 KB JSON on the server side only (imported from route-handler code, not client components).

### Freshness
The KB is a dated snapshot. `chunks.json` is replaced by re-exporting and committing; there is no runtime sync.
The tool returns each hit's `updated` year so the model can flag older material. A README note beside the JSON
records the compile date (2026-10-08) and that replacing the file needs no code change as long as the fields hold.

## Testing
- `kb-search.test.ts`: stemming/stop words reuse; title beats body; section-only match returns nothing; unrelated
  and empty queries return `[]`; `maxChunks` and excerpt cap; framing lines stripped.
- A data-integrity test over the real `chunks.json`: 84+ chunks, unique ids, all required fields non-empty strings,
  every text ≤ a sanity length.
- Recall test over the real KB: ~15 representative questions (e.g. "what is MECE", "how does recruitment work",
  "what does a project manager do", "who founded 180 degrees consulting", "what are the slide formatting rules")
  each assert the expected `section` is in the top 2. This is also the measurement of whether keyword search is
  good enough; misses are the signal to move to hybrid/embeddings.
- `routing.test.ts`: `READS` list gains `"knowledge"`.
- `tool-selection.live.test.ts` / `eval-fixtures.ts`: add questions that should pick `knowledge` vs `resources`
  (live-only, as the existing suite).
- `system-prompt.test.ts`: updated expectation for the new wording, and the prefix remains byte-stable across users.

## Open risks
- **Keyword recall on paraphrase.** Mitigated by the recall test and a clear upgrade seam; not solved.
- **Overlap with `resources`.** The model must choose between two search tools; the descriptions split them by
  topic, and the live tool-selection evals check it. If it routinely picks wrong, merge both behind one tool.
- **Staleness.** Snapshot-by-design; surfaced via the `updated` year, refreshed manually.
