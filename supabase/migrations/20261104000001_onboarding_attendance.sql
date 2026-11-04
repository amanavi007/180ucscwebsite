-- Attendance for Junior Consultant onboarding meetings.
--
-- JCs are tracked on their own roster (name + any email, no portal account), so
-- this does not touch the team attendance tables. Any exec can take attendance.
-- A JC who is dropped is soft-removed (removed_at) so their past marks survive.

create type onboarding_mark as enum ('present', 'tardy', 'excused', 'unexcused');

create table public.onboarding_jcs (
  id uuid primary key default gen_random_uuid(),
  quarter_id uuid not null references public.quarters (id) on delete cascade,
  name text not null,
  email text,
  removed_at timestamptz,
  removed_reason text,
  created_at timestamptz not null default now()
);
create index onboarding_jcs_quarter_id_idx on public.onboarding_jcs (quarter_id);

-- One row per onboarding meeting day. taken_by/taken_at are set once attendance is logged.
create table public.onboarding_meetings (
  id uuid primary key default gen_random_uuid(),
  quarter_id uuid not null references public.quarters (id) on delete cascade,
  date date not null,
  taken_by uuid references public.profiles (id) on delete set null,
  taken_at timestamptz,
  created_at timestamptz not null default now(),
  unique (quarter_id, date)
);
create index onboarding_meetings_quarter_id_idx on public.onboarding_meetings (quarter_id);

-- Every active JC gets a row when attendance is taken, so a JC added later is not
-- counted against meetings that happened before they joined.
create table public.onboarding_marks (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.onboarding_meetings (id) on delete cascade,
  jc_id uuid not null references public.onboarding_jcs (id) on delete cascade,
  mark onboarding_mark not null,
  unique (meeting_id, jc_id)
);
create index onboarding_marks_jc_id_idx on public.onboarding_marks (jc_id);

alter table public.onboarding_jcs enable row level security;
alter table public.onboarding_meetings enable row level security;
alter table public.onboarding_marks enable row level security;

create policy onboarding_jcs_exec on public.onboarding_jcs
  for all to authenticated using (public.is_exec()) with check (public.is_exec());
create policy onboarding_meetings_exec on public.onboarding_meetings
  for all to authenticated using (public.is_exec()) with check (public.is_exec());
create policy onboarding_marks_exec on public.onboarding_marks
  for all to authenticated using (public.is_exec()) with check (public.is_exec());

-- Absence thresholds (0 = off), editable in Admin > Settings.
insert into public.org_settings (key, value) values
  ('onboarding_max_unexcused', '2'),
  ('onboarding_max_absences', '3'),
  ('onboarding_min_rate', '0.8')
on conflict (key) do nothing;
