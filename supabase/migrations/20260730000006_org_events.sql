-- Ad-hoc org-wide calendar events (socials, workshops, info sessions, etc.)
-- distinct from meeting_dates (attendance-tracked meeting days, auto-seeded
-- per quarter) and project deadlines (derived from projects.deadline) --
-- this is the one calendar source exec actually authors by hand.

create table public.org_events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  date date not null,
  time text,
  location text,
  description text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index org_events_date_idx on public.org_events (date);

alter table public.org_events enable row level security;

-- Readable by anyone authenticated (org-wide calendar), writable by exec only.
create policy org_events_select on public.org_events
  for select to authenticated using (true);

create policy org_events_write on public.org_events
  for all to authenticated using (public.is_exec()) with check (public.is_exec());

create trigger org_events_set_updated_at
  before update on public.org_events
  for each row execute procedure public.set_updated_at();
