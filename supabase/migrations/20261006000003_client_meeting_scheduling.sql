-- Client meeting scheduling: businesses book 30-minute video intro calls with a
-- fixed panel of 3 execs (org_settings.client_meeting_panel). See docs/superpowers/
-- specs/2026-10-06-client-meeting-scheduling-design.md.
--
-- Exec/admin writes use the authenticated client (RLS below). Client writes come
-- from Server Actions using the service-role client; there is deliberately no anon policy.

create table public.client_meeting_availability (
  id uuid primary key default gen_random_uuid(),
  exec_id uuid not null references public.profiles (id) on delete cascade,
  date date not null,
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now(),
  constraint client_meeting_availability_time_check check (end_time > start_time)
);

create index client_meeting_availability_date_idx on public.client_meeting_availability (date);
create index client_meeting_availability_exec_id_idx on public.client_meeting_availability (exec_id);

alter table public.client_meeting_availability enable row level security;
create policy client_meeting_availability_all on public.client_meeting_availability
  for all to authenticated using (public.is_exec()) with check (public.is_exec());

create table public.client_meeting_slots (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  start_time time not null,
  end_time time not null,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_meeting_slots_time_check check (end_time > start_time)
);

create index client_meeting_slots_date_idx on public.client_meeting_slots (date);

alter table public.client_meeting_slots enable row level security;
create policy client_meeting_slots_all on public.client_meeting_slots
  for all to authenticated using (public.is_exec()) with check (public.is_exec());

create trigger client_meeting_slots_set_updated_at
  before update on public.client_meeting_slots
  for each row execute procedure public.set_updated_at();

create table public.client_meetings (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid not null references public.client_meeting_slots (id) on delete cascade,
  contact_name text not null,
  business_name text not null,
  email text not null,
  phone text,
  needs text not null,
  -- The 3 panel execs when this was booked, so later panel changes do not rewrite history.
  panel_exec_ids uuid[] not null,
  meeting_url text,
  status text not null default 'confirmed' check (status in ('confirmed', 'cancelled', 'completed')),
  manage_token text not null unique,
  reminder_day_before_sent_at timestamptz,
  reminder_morning_sent_at timestamptz,
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  constraint client_meetings_email_normalized check (email = lower(btrim(email))),
  constraint client_meetings_panel_size check (cardinality(panel_exec_ids) = 3)
);

-- Race-proof: one confirmed meeting per slot and per client email. Cancelling or
-- completing frees both.
create unique index client_meetings_slot_active_idx
  on public.client_meetings (slot_id) where status = 'confirmed';
create unique index client_meetings_email_active_idx
  on public.client_meetings (email) where status = 'confirmed';
create index client_meetings_panel_idx on public.client_meetings using gin (panel_exec_ids);

alter table public.client_meetings enable row level security;
create policy client_meetings_all on public.client_meetings
  for all to authenticated using (public.is_exec()) with check (public.is_exec());

insert into public.org_settings (key, value) values
  ('client_meeting_booking_open', 'false'),
  ('client_meeting_slot_minutes', '30'),
  ('client_meeting_panel', '[]')
on conflict (key) do nothing;
