-- Interview scheduling: invite-only booking of 60-minute interview slots
-- staffed by a panel of 2-3 execs. See docs/superpowers/specs/2026-10-06-
-- interview-scheduling-design.md.
--
-- Exec/admin writes use the authenticated client (RLS below). Applicant
-- writes come from Server Actions using the service-role client and never
-- touch RLS; there is deliberately no anon policy.

create table public.interview_invitees (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  name text,
  created_at timestamptz not null default now(),
  constraint interview_invitees_email_normalized check (email = lower(btrim(email)))
);

create unique index interview_invitees_email_idx on public.interview_invitees (email);

alter table public.interview_invitees enable row level security;
create policy interview_invitees_all on public.interview_invitees
  for all to authenticated using (public.is_exec()) with check (public.is_exec());

create table public.interview_availability (
  id uuid primary key default gen_random_uuid(),
  exec_id uuid not null references public.profiles (id) on delete cascade,
  date date not null,
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now(),
  constraint interview_availability_time_check check (end_time > start_time)
);

create index interview_availability_date_idx on public.interview_availability (date);
create index interview_availability_exec_id_idx on public.interview_availability (exec_id);

alter table public.interview_availability enable row level security;
create policy interview_availability_all on public.interview_availability
  for all to authenticated using (public.is_exec()) with check (public.is_exec());

create table public.interview_slots (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  start_time time not null,
  end_time time not null,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint interview_slots_time_check check (end_time > start_time)
);

create index interview_slots_date_idx on public.interview_slots (date);

alter table public.interview_slots enable row level security;
create policy interview_slots_all on public.interview_slots
  for all to authenticated using (public.is_exec()) with check (public.is_exec());

create trigger interview_slots_set_updated_at
  before update on public.interview_slots
  for each row execute procedure public.set_updated_at();

-- A panel is 2 or 3 execs, so execs live in a join table. The 2-3 bound is
-- enforced in the server actions (and by the bookable check), like other
-- business rules in this app.
create table public.interview_slot_execs (
  slot_id uuid not null references public.interview_slots (id) on delete cascade,
  exec_id uuid not null references public.profiles (id) on delete cascade,
  primary key (slot_id, exec_id)
);

create index interview_slot_execs_exec_id_idx on public.interview_slot_execs (exec_id);

alter table public.interview_slot_execs enable row level security;
create policy interview_slot_execs_all on public.interview_slot_execs
  for all to authenticated using (public.is_exec()) with check (public.is_exec());

create table public.interview_bookings (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid not null references public.interview_slots (id) on delete cascade,
  applicant_name text not null,
  applicant_email text not null,
  status text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
  manage_token text not null unique,
  reminder_day_before_sent_at timestamptz,
  reminder_morning_sent_at timestamptz,
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  constraint interview_bookings_email_normalized check (applicant_email = lower(btrim(applicant_email)))
);

-- Race-proof enforcement: one confirmed booking per slot, and one confirmed
-- booking per applicant email. Cancelling frees both, so a cancelled
-- applicant can book again.
create unique index interview_bookings_slot_active_idx
  on public.interview_bookings (slot_id) where status = 'confirmed';

create unique index interview_bookings_email_active_idx
  on public.interview_bookings (applicant_email) where status = 'confirmed';

alter table public.interview_bookings enable row level security;
create policy interview_bookings_all on public.interview_bookings
  for all to authenticated using (public.is_exec()) with check (public.is_exec());

insert into public.org_settings (key, value) values
  ('interview_booking_open', 'false'),
  ('interview_slot_minutes', '60')
on conflict (key) do nothing;
