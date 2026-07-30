-- Shared exec to-do list -- lightweight admin coordination checklist,
-- separate from the client-facing project Tasks system. Exec-only.

create table public.exec_todos (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  due_date date,
  assigned_to uuid references public.profiles (id) on delete set null,
  status text not null default 'open' check (status in ('open', 'done')),
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index exec_todos_status_idx on public.exec_todos (status);

alter table public.exec_todos enable row level security;

create policy exec_todos_all on public.exec_todos
  for all to authenticated using (public.is_exec()) with check (public.is_exec());

create trigger exec_todos_set_updated_at
  before update on public.exec_todos
  for each row execute procedure public.set_updated_at();
