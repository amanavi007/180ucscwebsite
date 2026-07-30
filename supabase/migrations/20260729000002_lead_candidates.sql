-- Team Builder-only tagging: mark someone as a PM/SC candidate for a given
-- quarter to help exec decide who to drag where. Purely advisory -- doesn't
-- touch memberships, doesn't grant any permission, and isn't surfaced
-- anywhere outside the Team Builder page.

create table public.lead_candidates (
  id uuid primary key default gen_random_uuid(),
  quarter_id uuid not null references public.quarters (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  candidate_role membership_team_role not null,
  created_at timestamptz not null default now(),
  unique (quarter_id, user_id),
  constraint lead_candidates_role_check check (candidate_role in ('pm', 'sc'))
);

create index lead_candidates_quarter_id_idx on public.lead_candidates (quarter_id);

alter table public.lead_candidates enable row level security;

create policy lead_candidates_all on public.lead_candidates
  for all to authenticated using (public.is_exec()) with check (public.is_exec());
