-- AI assistant, piece 1 (chat core). See docs/superpowers/specs/
-- 2026-10-07-ai-assistant-chat-core-design.md.
-- Every table is owned per user: users only ever see their own rows.

create table public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null default 'New chat',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index chat_threads_user_idx on public.chat_threads (user_id, updated_at desc);
alter table public.chat_threads enable row level security;
create policy chat_threads_own on public.chat_threads
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.chat_threads (id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  parts jsonb not null,
  created_at timestamptz not null default now()
);
create index chat_messages_thread_idx on public.chat_messages (thread_id, created_at);
alter table public.chat_messages enable row level security;
create policy chat_messages_own on public.chat_messages
  for all to authenticated
  using (exists (select 1 from public.chat_threads t where t.id = thread_id and t.user_id = auth.uid()))
  with check (exists (select 1 from public.chat_threads t where t.id = thread_id and t.user_id = auth.uid()));

create table public.chat_proposals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  thread_id uuid references public.chat_threads (id) on delete set null,
  tool text not null,
  args jsonb not null,
  preview text not null,
  status text not null default 'pending'
    check (status in ('pending', 'rejected', 'expired', 'approved', 'executed', 'failed')),
  error text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  executed_at timestamptz
);
create index chat_proposals_user_idx on public.chat_proposals (user_id, created_at desc);
alter table public.chat_proposals enable row level security;
create policy chat_proposals_own on public.chat_proposals
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create table public.chat_usage (
  user_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  message_count int not null default 0,
  tokens_in bigint not null default 0,
  tokens_out bigint not null default 0,
  primary key (user_id, day)
);
create index chat_usage_day_idx on public.chat_usage (day);
alter table public.chat_usage enable row level security;
create policy chat_usage_own_read on public.chat_usage
  for select to authenticated using (user_id = auth.uid());
-- Writes go only through the security-definer functions below.

create or replace function public.chat_day() returns date
  language sql stable as $$ select (now() at time zone 'America/Los_Angeles')::date $$;

-- Atomic per-user cap; the global check is a best-effort read just before it
-- (a few messages of overshoot under a race is acceptable for a free-tier ceiling).
create or replace function public.consume_chat_message(p_user_cap int, p_global_cap int)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_day date := public.chat_day();
  v_total bigint;
  v_rows int;
begin
  if auth.uid() is null then return 'unauthenticated'; end if;
  select coalesce(sum(message_count), 0) into v_total from public.chat_usage where day = v_day;
  if v_total >= p_global_cap then return 'global_cap'; end if;
  insert into public.chat_usage (user_id, day, message_count)
    values (auth.uid(), v_day, 1)
  on conflict (user_id, day) do update
    set message_count = public.chat_usage.message_count + 1
    where public.chat_usage.message_count < p_user_cap;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then return 'user_cap'; end if;
  return 'ok';
end $$;

-- System-only ledger functions (service_role). They take the user explicitly and are NOT
-- callable by signed-in users: if a user could call refund_chat_message they could refund
-- themselves after every message and defeat the daily cap.
create or replace function public.refund_chat_message(p_user uuid)
returns void language sql security definer set search_path = public as $$
  update public.chat_usage set message_count = greatest(message_count - 1, 0)
  where user_id = p_user and day = public.chat_day();
$$;

create or replace function public.record_chat_tokens(p_user uuid, p_in int, p_out int)
returns void language sql security definer set search_path = public as $$
  update public.chat_usage
  set tokens_in = tokens_in + greatest(p_in, 0), tokens_out = tokens_out + greatest(p_out, 0)
  where user_id = p_user and day = public.chat_day();
$$;

revoke execute on function public.refund_chat_message(uuid) from public, anon, authenticated;
revoke execute on function public.record_chat_tokens(uuid, int, int) from public, anon, authenticated;
grant execute on function public.refund_chat_message(uuid) to service_role;
grant execute on function public.record_chat_tokens(uuid, int, int) to service_role;

-- Kill switch: org_settings is exec-only under RLS, so expose just this flag.
-- Missing row means enabled.
insert into public.org_settings (key, value) values ('assistant_enabled', 'true')
on conflict (key) do nothing;

create or replace function public.assistant_is_enabled()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select lower(value) <> 'false' from public.org_settings where key = 'assistant_enabled'), true)
$$;

create or replace function public.get_chat_usage_today()
returns table (user_messages int, global_messages int)
language sql stable security definer set search_path = public as $$
  select
    coalesce((select message_count from public.chat_usage where user_id = auth.uid() and day = public.chat_day()), 0)::int,
    case when public.is_exec()
      then coalesce((select sum(message_count) from public.chat_usage where day = public.chat_day()), 0)::int
      else 0 end;
$$;

grant execute on function public.consume_chat_message(int, int) to authenticated;
grant execute on function public.assistant_is_enabled() to authenticated;
grant execute on function public.get_chat_usage_today() to authenticated;
