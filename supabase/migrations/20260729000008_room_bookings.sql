-- Which library room a team is in for a given meeting day. Not a fixed
-- per-team assignment -- exec reserves whatever rooms the library gives
-- them each meeting and records who's where, so everyone (not just exec)
-- knows where to go instead of finding out verbally at the meeting.

create table public.room_bookings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  date date not null,
  room_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, date)
);

create index room_bookings_date_idx on public.room_bookings (date);

alter table public.room_bookings enable row level security;

-- Readable by anyone authenticated (that's the point -- teams should know
-- where to go), writable by exec only (they're the ones who reserve rooms).
create policy room_bookings_select on public.room_bookings
  for select to authenticated using (true);

create policy room_bookings_write on public.room_bookings
  for all to authenticated using (public.is_exec()) with check (public.is_exec());

create trigger room_bookings_set_updated_at
  before update on public.room_bookings
  for each row execute procedure public.set_updated_at();
