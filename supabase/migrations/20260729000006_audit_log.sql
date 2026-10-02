-- Exec-only audit trail for consequential admin actions (account/role
-- changes, quarter lifecycle, org settings, team-plan finalize/apply).
-- Deliberately doesn't log routine day-to-day usage (task edits, attendance
-- marks, wiki content) -- see src/lib/audit.ts for what actually gets logged.

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  target_label text,
  detail text,
  created_at timestamptz not null default now()
);

create index audit_log_created_at_idx on public.audit_log (created_at desc);

alter table public.audit_log enable row level security;

create policy audit_log_select on public.audit_log
  for select to authenticated using (public.is_exec());

create policy audit_log_insert on public.audit_log
  for insert to authenticated with check (public.is_exec());
