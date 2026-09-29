-- Coffee chat scheduling: exec input their own availability, an admin
-- action turns overlapping availability into bookable 2-exec slots (with
-- manual swap), and applicants -- no login -- book a slot with just their
-- name and UCSC email. See docs/superpowers/specs/2026-09-28-coffee-chat-
-- scheduling-design.md for the full design.
--
-- All four writes into these tables come from Server Actions: the exec
-- side uses the normal authenticated client (RLS below), the applicant
-- side uses the service-role client and never touches RLS at all. RLS
-- here is exec-only on purpose -- there is no anon policy.

create table public.coffee_chat_availability (
  id uuid primary key default gen_random_uuid(),
  exec_id uuid not null references public.profiles (id) on delete cascade,
  date date not null,
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now(),
  constraint coffee_chat_availability_time_check check (end_time > start_time)
);

create index coffee_chat_availability_date_idx on public.coffee_chat_availability (date);
create index coffee_chat_availability_exec_id_idx on public.coffee_chat_availability (exec_id);

alter table public.coffee_chat_availability enable row level security;

create policy coffee_chat_availability_all on public.coffee_chat_availability
  for all to authenticated using (public.is_exec()) with check (public.is_exec());

create table public.coffee_chat_slots (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  start_time time not null,
  end_time time not null,
  location text not null default '',
  exec_id_1 uuid not null references public.profiles (id) on delete cascade,
  exec_id_2 uuid references public.profiles (id) on delete cascade,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coffee_chat_slots_time_check check (end_time > start_time)
);

create index coffee_chat_slots_date_idx on public.coffee_chat_slots (date);

alter table public.coffee_chat_slots enable row level security;

create policy coffee_chat_slots_all on public.coffee_chat_slots
  for all to authenticated using (public.is_exec()) with check (public.is_exec());

create trigger coffee_chat_slots_set_updated_at
  before update on public.coffee_chat_slots
  for each row execute procedure public.set_updated_at();

create table public.coffee_chat_bookings (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid not null references public.coffee_chat_slots (id) on delete cascade,
  applicant_name text not null,
  applicant_email text not null,
  status text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
  manage_token text not null unique,
  created_at timestamptz not null default now(),
  cancelled_at timestamptz
);

-- The real enforcement: at most one confirmed booking per slot, and at
-- most one confirmed booking per applicant email, even under a race --
-- Postgres rejects the second concurrent insert instead of both succeeding.
create unique index coffee_chat_bookings_slot_active_idx
  on public.coffee_chat_bookings (slot_id) where status = 'confirmed';

create unique index coffee_chat_bookings_email_active_idx
  on public.coffee_chat_bookings (applicant_email) where status = 'confirmed';

alter table public.coffee_chat_bookings enable row level security;

create policy coffee_chat_bookings_all on public.coffee_chat_bookings
  for all to authenticated using (public.is_exec()) with check (public.is_exec());

insert into public.org_settings (key, value) values
  ('coffee_chat_booking_open', 'false'),
  ('coffee_chat_default_location', '')
on conflict (key) do nothing;
