# AI Assistant — Piece 1: Chat Core

Date: 2026-10-07
Status: Design approved in conversation; awaiting written-spec review.

## Context and goal

The portal has many features (projects, tasks, recruitment points, scheduling, rosters) spread across
pages. The goal is a single AI assistant that can answer questions and take actions across the portal,
and replace the dashboard as the landing page at `/portal`. Long term it also answers consultants'
questions about their project materials (Google Drive) and drafts/sends client outreach emails.

The full vision is split into four independently shippable pieces. **This spec covers piece 1 only.**

1. **Chat core** (this spec): chat UI, model backend, auth, usage caps, storage, read tools, and the
   propose/approve framework for writes (with one example write tool).
2. **Knowledge (Drive RAG)**: sync Drive folders per project into a searchable index; scoped by project team.
3. **Action tools**: write tools for each existing feature area, all via propose/approve.
4. **Outreach automation**: draft client emails; sending happens only on approval, via Resend.

### Hard constraint: near-zero cost
The project owner cannot spend out-of-pocket money. Cost minimisation is a first-class requirement of
every piece, not a later optimisation. The system must run on free tiers, then on nonprofit credits
(the chapter is a branch of 180 Degrees Consulting; credit eligibility via the parent nonprofit is being
pursued separately), and must never be able to produce a surprise bill.

### Who uses it
All signed-in portal users (execs, project managers, consultants). What each person can see or do is
exactly what their existing portal permissions allow.

### Key decisions made with the project owner
- The assistant **takes actions**, but every write is **propose → user approves → execute**.
- Dashboard is replaced by the chat, with a **slim stats row** kept above it (zero token cost).
- Access to project materials (piece 2) is **by project team**: members of a project see that project's
  Drive folder plus shared Resources; execs see all. Drive layout is quarter → project.
- Architecture: **Vercel AI SDK inside the existing Next.js app**, provider-swappable, tools run as the
  logged-in user.
- Free tiers first; the free-tier provider only ever sees portal data, never client document content.

## Architecture

```
/portal (page)  →  <StatsRow> + <ChatPanel>
                         │ streams
                  /api/chat  (route handler)
                         │
  auth → usage cap check → model (swappable provider, cheap default)
                         │ tool calls
             src/lib/assistant/tools/  (one file per feature area)
             ├─ read tools: projects, tasks, events, recruitment…
             └─ write tools: create a proposal, never write directly
                         │
             /api/chat/approve → executes stored proposal as the user
```

Read the relevant Next.js guide in `node_modules/next/dist/docs/` (route handlers, streaming) before
implementing, per AGENTS.md; this Next version has breaking changes.

### Components
- **ChatPanel**: streaming message list, input, proposal cards with Approve/Reject, usage indicator
  ("12/30 messages today"), retry button on provider errors, thread list/new chat.
- **StatsRow**: slim, server-rendered, no model calls. Reuses existing dashboard queries.
- **`/api/chat`**: authenticates, checks caps, assembles a compact prompt, calls the provider with the tool
  set, streams the response, records usage.
- **Tools** (`src/lib/assistant/tools/*`): typed (zod) functions wrapping existing data-access code.
  Adding a feature area = adding a file; the chat core does not change.
- **Provider layer** (`src/lib/assistant/provider.ts`): the only file that names a vendor. Selected by env
  var; supports a fallback provider.
- **Approve endpoint**: loads the pending proposal, rechecks permissions and expiry, executes, audits.

## Data model

New migration, all tables with RLS keyed to `auth.uid()`:

- `chat_threads` (id, user_id, title, created_at, updated_at)
- `chat_messages` (id, thread_id, role, parts jsonb, created_at)
- `chat_proposals` (id, user_id, thread_id, tool, args jsonb, preview text, status
  [pending|approved|rejected|expired|executed|failed], created_at, expires_at, executed_at). Default expiry 24h.
- `chat_usage` (user_id, day date, message_count, tokens_in, tokens_out; primary key user_id+day). The global
  daily total is the sum over the day. Increment via an atomic upsert/RPC to avoid races.

Users read only their own rows. Execs get no access to other users' chats.

## Permissions and safety

- Every tool call uses the **user-scoped Supabase client**, never the service role. If RLS forbids it in the
  UI, it is forbidden in chat.
- Exec-only actions use the portal's existing role checks, **rechecked at approval time**.
- Write tools **only** insert a `chat_proposals` row and return a preview. Only the approve endpoint executes.
  A model can never write on its own.
- Tool results are treated as **data, not instructions** (prompt-injection hygiene; critical for pieces 2 and 4).
- Executed proposals write to the existing `audit_log`, tagged as chat-initiated.
- System prompt includes the user's name, role, current quarter and project memberships. Facts about portal
  data come from tool results, not model memory; the prompt instructs the model to say so when a tool returns
  nothing instead of guessing.

## Cost optimisation (primary requirement)

Goal: stay inside free quotas for a whole quarter of normal use, degrade gracefully when they run out, and
make a surprise bill structurally impossible.

### Hard guards
- **No billing path by default.** Use only keys on free tiers / no-card plans. The code treats a provider
  "quota exceeded" response as a normal state, not an error to work around.
- **Per-user daily message cap** (default 30, configurable) and **global daily ceiling** set below the
  provider's free quota. Both checked before any model call. Enforced server-side and shown in the UI.
- **Per-request ceilings**: max input tokens, max output tokens, max tool-call steps per message (default 4),
  max tool-result size. Requests exceeding them are truncated or refused, not sent.
- **Kill switch**: an `org_settings` flag to disable the assistant instantly.
- **Provider fallback** is limited to other *free* providers and tried once on 429/5xx; if both fail the user
  sees a "try again later" message.

### Token minimisation
- **Smallest capable model by default** (Flash-class or small open model), chosen via env var; a larger model
  is opt-in per feature later (e.g. email drafting), never the default.
- **Compact system prompt**, kept stable and prefix-identical across requests so providers' implicit prompt
  caching applies where offered.
- **Sliding context window**: only the last N turns are sent (default 8); older turns are dropped, with a
  one-line summary only if it is cheap and needed.
- **Lazy tool exposure**: send only the tool definitions relevant to the conversation area (a tiny router
  step by keyword/route, no extra model call) instead of all tools every time. Tool descriptions are kept short.
- **Tools return trimmed data**: select only needed columns, cap rows (default 20) with a "more available"
  flag, and return compact JSON, not whole records.
- **Answer from the stats row / cached facts when possible**: common questions ("how many tasks overdue")
  can be served by deterministic shortcuts that skip the model entirely (a small set of exact-intent handlers).
- **Response caching**: identical read-only questions by the same role within a short TTL reuse the previous
  answer when the underlying data version has not changed. Keep conservative; correctness over hit rate.
- **No re-sending tool results across turns**: stored tool results are replaced by short stubs in history sent
  back to the model.
- **Concise output**: system prompt instructs brief answers; output token cap enforced.
- **Titles without a model call**: thread titles derive from the first message text, not an LLM call.

### Compute and infra
- Route handler runs on the existing Vercel plan; streaming avoids long-held function time cost.
- DB: indexes on `chat_threads(user_id, updated_at)`, `chat_messages(thread_id, created_at)`, and
  `chat_usage` PK; old threads pruned or archived after a retention window (default 90 days) to bound storage.
- Usage and quota reads are single indexed queries; no per-token DB writes (usage is written once per request).

### Observability for cost
- Per-request log of provider, model, tokens in/out, tool steps, cache hit, and whether a deterministic
  shortcut was used. An exec-visible admin line (or table query) shows daily usage vs. ceiling so the owner
  can see burn rate before limits are hit.

## Privacy gate

The free-tier provider may use prompts for training or human review. Therefore:
- Piece 1 exposes **portal data only**. Even so, tools omit sensitive fields that are not needed to answer
  (e.g. no personal emails/phones unless the caller is allowed and the question needs them).
- A config switch `ASSISTANT_ALLOW_CLIENT_DOCS` (default off) must be explicitly enabled, and only alongside a
  provider known not to train on inputs, before piece 2 can send Drive content to a model.

## Error handling

- Provider down or rate-limited: clear in-chat message with a retry button; usage is not charged for failed
  requests.
- Cap reached: friendly message stating the limit and when it resets.
- Tool failure: error returned to the model to explain plainly; no partial writes (writes only occur in approve).
- Expired/already-executed proposal: approve button disabled with the reason; approve is idempotent.
- Approval-time permission change: execution refused with an explanation.

## Testing (Vitest)

- Each tool: schema validation, permission behaviour, row/column caps.
- Write tools never write without approval; approve endpoint rechecks permissions, expiry, idempotency.
- Usage cap logic: per-user and global, race-safe increments, reset at day boundary.
- Context trimming, tool-result stubbing, lazy tool selection, deterministic shortcut routing.
- Cache: hit/miss and invalidation when data version changes.
- Chat route with a mocked provider: streaming, fallback on 429, cap refusal.

## Out of scope for this spec

Drive/knowledge search (piece 2), the full set of write tools (piece 3), outreach email sending (piece 4),
voice input, file uploads in chat, multi-user shared threads.

## Open items to confirm during implementation

- Which free provider(s) are primary and fallback, verified against their current official limits and data
  terms at build time.
- Exact default caps (per-user messages, global ceiling) once real provider quotas are confirmed.
- Whether the parent 180DC organisation already holds Google/Microsoft nonprofit credits that the chapter can use.
