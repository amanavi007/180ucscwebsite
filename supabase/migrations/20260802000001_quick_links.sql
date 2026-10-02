-- Quick Links: exec-managed list of external resources (Drive docs, Slack,
-- etc.) shown as a tab on the Resources page. Visible to every member,
-- editable by exec only -- same posture as wiki_pages.
create table public.quick_links (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  url text not null,
  description text,
  category text,
  sort_order integer not null default 0,
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index quick_links_category_idx on public.quick_links (category);

create trigger quick_links_set_updated_at
  before update on public.quick_links
  for each row execute procedure public.set_updated_at();

alter table public.quick_links enable row level security;

create policy quick_links_select on public.quick_links
  for select to authenticated using (true);

create policy quick_links_write on public.quick_links
  for all to authenticated using (public.is_exec()) with check (public.is_exec());
