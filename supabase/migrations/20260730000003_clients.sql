-- Persistent client record, separate from a project's per-quarter client_name
-- text field, so a returning client's contact info and history carry across
-- quarters instead of living in someone's memory. Linking a project to a
-- client is optional (client_id nullable) -- client_name keeps working
-- standalone for projects that never get linked.

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_name text,
  contact_email text,
  notes text,
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index clients_name_idx on public.clients (lower(name));

alter table public.projects
  add column client_id uuid references public.clients (id) on delete set null;

alter table public.clients enable row level security;

create policy clients_select on public.clients
  for select to authenticated using (true);

create policy clients_write on public.clients
  for all to authenticated using (public.is_exec()) with check (public.is_exec());

create trigger clients_set_updated_at
  before update on public.clients
  for each row execute procedure public.set_updated_at();
