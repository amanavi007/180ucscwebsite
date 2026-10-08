# Chapter knowledge base

`chunks.json` is the assistant's `knowledge` tool data: an array of chunks (`id`, `title`, `section`,
`source_title`, `source_url`, `updated`, `text`), compiled from the chapter Drive on 2026-10-08.

Refreshing: re-export `chunks.jsonl`, convert it to a JSON array (see the plan, Task 1 Step 1), replace this file,
and run `npx vitest run src/lib/assistant`. No code change is needed while the fields above hold. The integrity
and recall tests will flag a broken export.

`source_url` is stored but deliberately never shown to the model or the UI (Drive access is per-project).
