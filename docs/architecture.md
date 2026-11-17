# Architecture

## Layout

```
src/
  app/
    (marketing)/     Public site and booking flows
    portal/          Authenticated member and admin app
    login/
    api/             Route handlers: cron jobs, AI chat, webhooks, booking feeds, outreach agent API
  actions/           Server actions (thin: auth check, validate, call lib/data, revalidate)
  components/        Shared UI; ui/ holds shadcn-style primitives
  lib/
    *.ts             Pure domain logic (scheduling, scoring, matching, CSV parsing), unit-tested
    data/            Server-only Supabase queries
    supabase/        Client factories (browser, server, service-role) and generated DB types
    auth/            Role definitions and access helpers
    email/           Email builders and providers
    assistant/       AI assistant: prompt, tools, quota, proposals, evals
    outreach/        Outreach pipeline: discovery, drafting, sending, agent API
    prelim-review/   AI document and slides reviewer
  proxy.ts           Refreshes the Supabase session on each request
supabase/migrations/ Ordered SQL migrations (schema, RLS policies, functions, triggers)
scripts/             One-off operational scripts for the outreach pipeline
docs/                Setup guides and the UI rulebook
```

## Request flow

1. `src/proxy.ts` refreshes the Supabase auth cookie and redirects unauthenticated visitors away from `/portal`.
2. Pages are Server Components that read through `lib/data/*`, using the user's session, so Row Level Security applies.
3. Mutations go through server actions, which check the caller's role (`lib/auth/roles.ts`), validate input, then write.
4. Only a few places use the service-role client (`lib/supabase/admin.ts`, which is `server-only`): creating accounts, resetting passwords, and background jobs.

## Roles

Ten roles from Junior Consultant up to President. "Exec" roles can manage members, recruiting, settings and outreach. Project leads get access scoped to their own projects (`lib/auth/project-access.ts`). The database policies mirror these rules, so a bug in the UI cannot widen access.

## Background jobs

Vercel Cron calls `/api/cron/*` (see `vercel.json`). Each route requires `Authorization: Bearer $CRON_SECRET`. Vercel cron runs on UTC, so jobs that must run at a local hour are scheduled twice and check the Pacific hour before doing work, which handles daylight saving.

Jobs: attendance, interview and client-meeting reminders, assistant chat pruning, and the outreach pipeline (discover, prepare drafts, send, repair).

## AI assistant

`lib/assistant` builds a tool-calling chat on the Vercel AI SDK with a primary model and a fallback. Design choices:

- Read tools run immediately. Anything that changes data becomes a **proposal** that an exec must approve in the UI (`api/chat/approve`).
- Per-user and global daily quotas, same-origin checks, and retention pruning.
- `adversarial.test.ts` covers injection and permission cases offline; `*.live.test.ts` run against a real model only when `LIVE_EVAL=1`.

## Outreach pipeline

Prospects come from CSV import, discovery against public sources, or the scoped agent API (`docs/outreach-agent-api.md`). The runner verifies contact domains, drafts personalised emails with an AI model, sends slowly under daily caps from a dedicated subdomain, tracks replies via a Resend webhook, and honours one-click unsubscribe. A test mode lets execs read every draft before anything is sent. Setup is in `docs/outreach-setup.md`.

## Testing

Vitest, colocated as `*.test.ts`. Tests focus on the pure `lib` modules, email templates, permission rules and shared UI guards. Run `npm test`.
