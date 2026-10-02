-- Explicit per-quarter meeting day calendar. Auto-seeded with Tue/Thu
-- between a quarter's start/end dates on creation (see createQuarter() in
-- src/actions/quarters.ts), but exec can toggle individual dates on/off
-- from Admin > Meeting Days (dead week, holidays, extra sessions, etc.) --
-- this table is the actual source of truth, not the weekday rule.

create table public.meeting_dates (
  id uuid primary key default gen_random_uuid(),
  quarter_id uuid not null references public.quarters (id) on delete cascade,
  date date not null,
  created_at timestamptz not null default now(),
  unique (quarter_id, date)
);

create index meeting_dates_quarter_id_idx on public.meeting_dates (quarter_id);

alter table public.meeting_dates enable row level security;

-- Readable by anyone authenticated (PM/SC need to know if today's a meeting
-- day for their own nudge), writable by exec only.
create policy meeting_dates_select on public.meeting_dates
  for select to authenticated using (true);

create policy meeting_dates_write on public.meeting_dates
  for all to authenticated using (public.is_exec()) with check (public.is_exec());

-- Backfill existing quarters (created before this table existed) with the
-- default Tue/Thu schedule, so they're not empty on first load.
insert into public.meeting_dates (quarter_id, date)
select q.id, d::date
from public.quarters q,
     generate_series(q.start_date, q.end_date, interval '1 day') d
where extract(dow from d) in (2, 4)
on conflict (quarter_id, date) do nothing;
