-- Notifications themselves are computed on the fly from existing tables
-- (tasks, exec_todos, memberships, room_bookings) -- no event log to write
-- to on every mutation. This table only tracks the one piece of state that
-- has to persist: when each person last opened their notification bell, so
-- "unread" can be computed as "newer than that timestamp."

create table public.notification_reads (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  last_read_at timestamptz not null default now()
);

alter table public.notification_reads enable row level security;

create policy notification_reads_own on public.notification_reads
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
