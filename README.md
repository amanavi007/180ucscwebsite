# 180 Degrees Consulting at UCSC

The public website and internal member portal for [180 Degrees Consulting at UC Santa Cruz](https://www.ucsc180dc.org), a student-run consultancy that does pro bono projects for nonprofits and social enterprises. It is deployed in production.

I built and maintain it. The goal was to replace the club's spreadsheet-based tracking with one system.

## What it does

**Public site** (`src/app/(marketing)`): club pages, client showcase, and public booking flows for coffee chats and recruitment interviews (Cloudflare Turnstile bot check, calendar invites, reminder emails).

**Member portal** (`src/app/portal`), role-based for members, project leads and execs:

- **Projects and tasks**: team assignments, per-member task tracking with stage timelines, project health.
- **Recruiting**: applicant import, rubric-based scoring, reviewer assignment, interview scheduling, decision views.
- **Attendance and onboarding**: meeting attendance with automatic reminder emails, onboarding checklists.
- **Client meetings, calendar and room booking.**
- **AI assistant**: a chat assistant with tool calling that can propose actions for an exec to approve. It has per-user and global daily caps, provider fallback, and prompt-injection tests.
- **Prelim reviewer**: AI feedback on a team's documents and slides from Google Drive against a rubric.
- **Automated outreach**: a pipeline that finds prospective clients, verifies contacts, drafts emails, sends them slowly, detects replies and honours unsubscribes. An external research agent can submit prospects through a scoped API.
- **Admin tools**: member management, audit log, org settings, stats.

## Tech stack

| Area | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router, server actions), React 19, TypeScript (strict) |
| Database and auth | Supabase (Postgres, Row Level Security, Auth), 60+ SQL migrations |
| UI | Tailwind CSS 4, shadcn/ui on Base UI, Lucide icons |
| AI | Vercel AI SDK 7 with Google Gemini and Groq |
| Email | Resend and Gmail SMTP |
| Hosting | Vercel (cron jobs for reminders and the outreach pipeline) |
| Testing | Vitest (about 120 test files) |

## Engineering notes

- **Authorization is enforced in the database.** Tables use Row Level Security; the service-role client is only used in server-only modules for admin work.
- **Logic is kept out of components.** Scheduling, scoring, matching, CSV parsing and email building live in pure, unit-tested modules under `src/lib`; server actions in `src/actions` stay thin.
- **Side effects are guarded.** Outreach has a test mode, daily send caps, suppression lists, and idempotent API calls. Cron-driven jobs fail independently so one bad record can't stop a batch.
- **UI rules are written down** in [`docs/ui-rulebook.md`](docs/ui-rulebook.md), with tests that guard recurring layout bugs.

More detail is in [`docs/architecture.md`](docs/architecture.md).

## Getting started

Requires Node 22+ and a Supabase project.

```bash
npm install
cp .env.local.example .env.local   # fill in the values; each variable is documented inline
```

Apply the migrations in `supabase/migrations` to your Supabase project (for example with the Supabase CLI: `supabase link` then `supabase db push`), then:

```bash
npm run dev        # http://localhost:3000
```

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript check |
| `npm test` | Unit tests (live AI evals are skipped unless `LIVE_EVAL=1`) |

## Docs

- [Architecture](docs/architecture.md)
- [UI rulebook](docs/ui-rulebook.md)
- [Outreach setup](docs/outreach-setup.md) and [agent API](docs/outreach-agent-api.md)

## License

[MIT](LICENSE)
