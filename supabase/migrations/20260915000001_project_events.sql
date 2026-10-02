-- Project-scoped calendar items: lets a PM/SC add their own agenda items
-- (a 1:1 with a specific consultant, a team check-in, etc.) on top of the
-- org-wide calendar (org_events), which only exec can author. Distinct table
-- rather than reusing org_events because visibility/write rules differ:
-- scoped to the project team, not everyone.

create table public.project_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  -- Null means the item is for the whole project team; set means it's about
  -- one consultant specifically (e.g. a 1:1 agenda).
  consultant_id uuid references public.profiles (id) on delete set null,
  title text not null,
  date date not null,
  time text,
  location text,
  description text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index project_events_project_id_idx on public.project_events (project_id);
create index project_events_date_idx on public.project_events (date);

alter table public.project_events enable row level security;

-- Same shape as meeting_notes: visible to the project team (or exec),
-- writable by the project's PM/SC (or exec).
create policy project_events_select on public.project_events
  for select to authenticated using (public.is_exec() or public.is_on_project(project_id));

create policy project_events_write on public.project_events
  for all to authenticated
  using (public.is_exec() or public.leads_project(project_id))
  with check (public.is_exec() or public.leads_project(project_id));

create trigger project_events_set_updated_at
  before update on public.project_events
  for each row execute procedure public.set_updated_at();
